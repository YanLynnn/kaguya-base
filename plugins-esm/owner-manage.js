// Kelola owner dari chat: .addowner .delowner .listowner  (khusus owner)
// Owner tambahan disimpan di database.json; owner dari config.js tidak bisa dihapus lewat chat.
import { saveDb } from '../lib/database.js'
import { getTarget, numberOf, digits } from '../lib/util.js'

let handler = async (m, { command, text, prefix }) => {
    const p = prefix || '.'
    const fromConfig = [].concat(global.owners || []).map(digits).filter(Boolean)

    if (command === 'listowner') {
        const extra = global.db.owners
        return m.reply([
            '*DAFTAR OWNER*',
            '',
            'Dari config.js:',
            ...(fromConfig.length ? fromConfig.map(n => `• ${n}`) : ['• (kosong)']),
            '',
            'Tambahan:',
            ...(extra.length ? extra.map(n => `• ${n}`) : ['• (kosong)'])
        ].join('\n'))
    }

    const target = getTarget(m, text)
    if (!target) return m.reply(`Tag, reply, atau tulis nomornya.\nContoh: ${p}${command} 628123456789`)
    const num = numberOf(target)

    if (command === 'addowner') {
        if (fromConfig.includes(num) || global.db.owners.includes(num)) return m.reply(`${num} sudah jadi owner.`)
        global.db.owners.push(num)
        saveDb()
        return m.reply(`${num} ditambahkan sebagai owner.`)
    }

    if (fromConfig.includes(num)) return m.reply('Owner dari config.js tidak bisa dihapus lewat chat. Edit config.js.')
    const i = global.db.owners.indexOf(num)
    if (i < 0) return m.reply(`${num} bukan owner tambahan.`)
    global.db.owners.splice(i, 1)
    saveDb()
    return m.reply(`${num} dihapus dari owner.`)
}

handler.command = ['addowner', 'delowner', 'listowner']
handler.tags = ['owner']
handler.owner = true

export default handler
