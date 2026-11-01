import util from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import chalk from 'chalk'
import { initPlugins, findPlugin, parseCommand } from './lib/plugins.js'
import { toPN } from './lib/lid.js'
import { getUser, saveDb } from './lib/database.js'
import { groupInfo } from './lib/group.js'

await initPlugins()

const digits = (v) => String(v || '').replace(/\D/g, '')

// daftar nomor owner di-cache; dihitung ulang hanya kalau global.owners berubah
let ownersKey = ''
let ownerSet = new Set()
function owners() {
    const key = [].concat(global.owners || [], global.db?.owners || []).join(',')
    if (key !== ownersKey) {
        ownersKey = key
        ownerSet = new Set(key.split(',').map(digits).filter(Boolean))
    }
    return ownerSet
}

// m.sender sudah berupa nomor (LID otomatis dikonversi di serialize), jadi cukup cocokkan nomornya
function isOwner(m) {
    if (m.fromMe) return true
    const set = owners()
    return set.has(digits(m.sender.split('@')[0]))
}

// ───────── eval: => (format) | > (inspect) | $ (shell), khusus owner ─────────
async function devtools(sock, m, body) {
    const jid = m.chat

    if (body.startsWith('=>') || body.startsWith('>')) {
        const raw = body.startsWith('=>')
        const code = body.slice(raw ? 2 : 1).trim()
        const { key } = await sock.sendMessage(jid, { text: 'Evaling...' }, { quoted: m })
        try {
            const result = await eval(`(async () => { return ${code} })()`)
            await sock.sendMessage(jid, { text: raw ? util.format(result) : util.inspect(result), edit: key })
        } catch (e) {
            await sock.sendMessage(jid, { text: util.format(e), edit: key })
        }
        return true
    }

    if (body.startsWith('$')) {
        const cmd = body.slice(1).trim()
        const { key } = await sock.sendMessage(jid, { text: 'Executing...' }, { quoted: m })
        exec(cmd, async (err, stdout, stderr) => {
            if (err) return sock.sendMessage(jid, { text: util.format(err), edit: key })
            if (stderr) return sock.sendMessage(jid, { text: stderr, edit: key })
            await sock.sendMessage(jid, { text: stdout || 'No output', edit: key })
        })
        return true
    }

    return false
}

const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i
const cooldowns = new Map()

// antilink: hapus pesan berisi link grup WhatsApp (dan keluarkan pengirim kalau mode kick)
async function antilink(sock, m, body, owner) {
    const mode = global.db.groups[m.chat]?.antilink
    if (!mode || mode === 'off' || !LINK_RE.test(body)) return false

    const info = await groupInfo(sock, m)
    if (!info.isBotAdmin || info.isAdmin || owner) return false

    const who = m.key.participant
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => null)
    if (mode === 'kick' && who) {
        await sock.groupParticipantsUpdate(m.chat, [who], 'remove').catch(() => null)
    }
    await sock.sendMessage(m.chat, {
        text: `@${String(who || '').split('@')[0]} dilarang mengirim link grup.${mode === 'kick' ? ' Kamu dikeluarkan.' : ''}`,
        mentions: who ? [who] : []
    }).catch(() => null)
    return true
}

// kirim detail error ke owner pertama (bisa dimatikan: global.errorlog = false)
function reportError(sock, m, prefix, command, e) {
    if (global.errorlog === false) return
    const first = digits([].concat(global.owners || [], global.db?.owners || []).find(Boolean))
    if (!first) return
    const text = [
        '*ERROR COMMAND*',
        `Command : ${prefix}${command}`,
        `Dari    : ${m.pushName} (${m.sender.split('@')[0]})`,
        `Chat    : ${m.isGroup ? 'grup ' : 'private '}${m.chat}`,
        '',
        String(e?.stack || e?.message || e).slice(0, 1500)
    ].join('\n')
    sock.sendMessage(`${first}@s.whatsapp.net`, { text }).catch(() => null)
}

export const handler = async (sock, m) => {
    // cek paling murah dulu, supaya pesan yang tidak relevan selesai secepat mungkin
    const body = m.body
    if (!body || !m.message || m.isBaileys) return
    if (global.botSentIds?.has(m.id)) return
    if (m.chat === 'status@broadcast' || m.chat.endsWith('@newsletter')) return

    const owner = isOwner(m)
    const num = digits(m.sender.split('@')[0])

    if (!owner && global.db.users[num]?.banned) return
    if (m.isGroup && !m.fromMe && await antilink(sock, m, body, owner)) return

    if (!owner && global.public !== true) return

    if (owner && await devtools(sock, m, body)) return

    const { isCmd, prefix, command, text } = parseCommand(body)
    if (!isCmd) return

    const plugin = findPlugin(command)
    if (!plugin) return

    if (plugin.owner && !owner) return m.reply(global.mess.owner)
    if (plugin.group && !m.isGroup) return m.reply(global.mess.group)
    if (plugin.private && m.isGroup) return m.reply(global.mess.private)

    // cooldown per user per command (owner dilewati)
    if (!owner) {
        const secs = Number(plugin.cooldown ?? global.cooldown ?? 0)
        if (secs > 0) {
            const key = `${num}:${command}`
            const left = (cooldowns.get(key) || 0) - Date.now()
            if (left > 0) return m.reply(`Tunggu ${Math.ceil(left / 1000)} detik lagi sebelum memakai *${prefix}${command}*.`)
            cooldowns.set(key, Date.now() + secs * 1000)
            if (cooldowns.size > 3000) {
                const now = Date.now()
                for (const [k, t] of cooldowns) if (t < now) cooldowns.delete(k)
            }
        }
    }

    // cek admin / bot admin (hanya dihitung kalau plugin memintanya)
    let info = null
    if (plugin.admin || plugin.botAdmin) {
        if (!m.isGroup) return m.reply(global.mess.group)
        info = await groupInfo(sock, m)
        if (plugin.admin && !info.isAdmin && !owner) return m.reply(global.mess.admin)
        if (plugin.botAdmin && !info.isBotAdmin) return m.reply(global.mess.botAdmin)
    }

    const ctx = {
        sock, text, prefix, command, body, isCmd,
        args: text ? text.split(/\s+/) : [],
        reply: m.reply,
        sender: m.sender,
        jid: m.chat,
        isOwner: owner,
        isAdmin: info?.isAdmin ?? false,
        isBotAdmin: info?.isBotAdmin ?? false,
        participants: info?.participants ?? [],
        groupMetadata: info?.meta ?? null
    }

    try {
        console.log(chalk.greenBright(`[ CMD ] ${prefix}${command} dari ${m.pushName} (${num})`))
        const user = getUser(num)
        user.hit++
        user.lastSeen = Date.now()
        user.name = m.pushName
        saveDb()
        await plugin(m, ctx)
    } catch (e) {
        console.error(e)
        await m.reply(`Terjadi error: ${e?.message || String(e)}`).catch(() => null)
        reportError(sock, m, prefix, command, e)
    }
}
