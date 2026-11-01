// Pengaturan grup: .welcome .leave .antilink .setwelcome .setbye .tagall  (khusus admin grup)
import { getGroup, saveDb } from '../lib/database.js'
import { DEFAULT_WELCOME, DEFAULT_LEAVE } from '../lib/groupEvents.js'
import { panel } from '../lib/util.js'

const ON = ['on', 'aktif', '1', 'enable']
const OFF = ['off', 'mati', '0', 'disable']

let handler = async (m, { command, text, args, prefix, participants, isBotAdmin }) => {
    const p = prefix || '.'
    const g = getGroup(m.chat)
    const arg = (args[0] || '').toLowerCase()

    switch (command) {
        case 'welcome':
        case 'leave':
        case 'bye': {
            const key = command === 'welcome' ? 'welcome' : 'leave'
            const name = command === 'welcome' ? 'welcome' : 'leave'
            if (ON.includes(arg)) g[key] = true
            else if (OFF.includes(arg)) g[key] = false
            saveDb()
            const on = !!g[key]
            return panel(m, {
                title: `👋 ${name.toUpperCase()}`,
                text: `Pesan ${name} di grup ini: *${on ? 'AKTIF' : 'MATI'}*\n\nUbah teksnya dengan ${p}set${key === 'welcome' ? 'welcome' : 'bye'} <teks>\nGunakan @user dan @group.`,
                buttons: [{ id: `${p}${name} ${on ? 'off' : 'on'}`, text: on ? '🔕 Matikan' : '🔔 Aktifkan' }]
            })
        }

        case 'setwelcome':
        case 'setbye': {
            const key = command === 'setwelcome' ? 'welcomeText' : 'leaveText'
            const def = command === 'setwelcome' ? DEFAULT_WELCOME : DEFAULT_LEAVE
            if (!text) return m.reply(`Contoh: ${p}${command} Halo @user, selamat datang di @group!\nKetik *${p}${command} reset* untuk kembali ke bawaan.\n\nSekarang:\n${g[key] || def}`)
            g[key] = text.toLowerCase() === 'reset' ? undefined : text
            saveDb()
            return m.reply(g[key] ? 'Teks diperbarui.' : 'Teks dikembalikan ke bawaan.')
        }

        case 'antilink': {
            if (['on', 'delete', 'hapus'].includes(arg)) g.antilink = 'delete'
            else if (arg === 'kick') g.antilink = 'kick'
            else if (OFF.includes(arg)) g.antilink = 'off'
            saveDb()
            const mode = g.antilink || 'off'
            return panel(m, {
                title: '🔗 ANTILINK',
                text: [
                    `Mode: *${mode.toUpperCase()}*`,
                    '',
                    'DELETE : hapus pesan berisi link grup WhatsApp',
                    'KICK   : hapus pesan + keluarkan pengirim',
                    '',
                    isBotAdmin ? '' : '⚠️ Bot belum jadi admin, antilink tidak akan berjalan.'
                ].join('\n').trim(),
                buttons: [
                    { id: `${p}antilink delete`, text: '🧹 Delete' },
                    { id: `${p}antilink kick`, text: '🚪 Kick' },
                    { id: `${p}antilink off`, text: '🔕 Off' }
                ]
            })
        }

        case 'tagall': {
            const ids = participants.map(x => x.id)
            const lines = ids.map(j => `• @${j.split('@')[0]}`)
            return m.reply(`*TAG ALL*${text ? `\n${text}` : ''}\n\n${lines.join('\n')}`, { mentions: ids })
        }
    }
}

handler.command = ['welcome', 'leave', 'bye', 'setwelcome', 'setbye', 'antilink', 'tagall']
handler.tags = ['group']
handler.group = true
handler.admin = true

export default handler
