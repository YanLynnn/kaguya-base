import util from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import chalk from 'chalk'
import { initPlugins, findPlugin, findCase, parseCommand } from './lib/plugins.js'
import { toPN } from './lib/lid.js'

await initPlugins()

const digits = (v) => String(v || '').replace(/\D/g, '')

// daftar nomor owner di-cache; dihitung ulang hanya kalau global.owners berubah
let ownersKey = ''
let ownerSet = new Set()
function owners() {
    const key = [].concat(global.owners || []).join(',')
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

export const handler = async (sock, m) => {
    // cek paling murah dulu, supaya pesan yang tidak relevan selesai secepat mungkin
    const body = m.body
    if (!body || !m.message || m.isBaileys) return
    if (global.botSentIds?.has(m.id)) return
    if (m.chat === 'status@broadcast' || m.chat.endsWith('@newsletter')) return

    const owner = isOwner(m)
    if (!owner && global.public !== true) return

    if (owner && await devtools(sock, m, body)) return

    const { isCmd, prefix, command, text } = parseCommand(body)
    if (!isCmd) return

    const plugin = findPlugin(command)
    const caseHandler = plugin ? null : findCase(command)
    if (!plugin && !caseHandler) return

    const ctx = {
        sock, text, prefix, command, body, isCmd,
        args: text ? text.split(/\s+/) : [],
        reply: m.reply,
        sender: m.sender,
        jid: m.chat,
        isOwner: owner
    }

    if (plugin) {
        if (plugin.owner && !owner) return m.reply(global.mess.owner)
        if (plugin.group && !m.isGroup) return m.reply(global.mess.group)
        if (plugin.private && m.isGroup) return m.reply(global.mess.private)
    }

    try {
        console.log(chalk.greenBright(`[ CMD ] ${prefix}${command} dari ${m.pushName} (${m.sender.split('@')[0]})`))
        await (plugin || caseHandler)(m, ctx)
    } catch (e) {
        console.error(e)
        await m.reply(`Terjadi error: ${e?.message || String(e)}`).catch(() => null)
    }
}
