// Blokir user dari bot: .ban .unban .listban  (khusus owner)
import { getUser, saveDb } from '../lib/database.js'
import { getTarget, numberOf } from '../lib/util.js'

let handler = async (m, { command, text, prefix }) => {
    const p = prefix || '.'

    if (command === 'listban') {
        const list = Object.entries(global.db.users).filter(([, u]) => u.banned)
        if (!list.length) return m.reply('Tidak ada user yang diban.')
        return m.reply(`*DAFTAR BAN* (${list.length})\n\n${list.map(([n, u]) => `• ${n}${u.name ? ` (${u.name})` : ''}`).join('\n')}`)
    }

    const target = getTarget(m, text)
    if (!target) return m.reply(`Tag, reply, atau tulis nomornya.\nContoh: ${p}${command} @user`)
    const num = numberOf(target)

    if (command === 'ban') {
        const owners = [].concat(global.owners || [], global.db?.owners || []).map(numberOf)
        if (owners.includes(num)) return m.reply('Tidak bisa ban owner.')
        getUser(num).banned = true
        saveDb()
        return m.reply(`${num} diban. Bot tidak akan merespons dia lagi.`)
    }

    const user = global.db.users[num]
    if (!user?.banned) return m.reply(`${num} tidak sedang diban.`)
    user.banned = false
    saveDb()
    return m.reply(`${num} sudah di-unban.`)
}

handler.command = ['ban', 'unban', 'listban']
handler.tags = ['owner']
handler.owner = true

export default handler
