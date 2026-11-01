// .restart dan .broadcast  (khusus owner)
import { spawn } from 'child_process'
import { flushDb } from '../lib/database.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function restart() {
    flushDb()
    const mode = global.restartMode || 'auto'
    // di bawah pm2 / panel yang otomatis menyalakan ulang, cukup keluar
    const managed = mode === 'exit' || (mode === 'auto' && (process.env.pm_id || process.env.PM2_HOME))
    if (!managed) {
        spawn(process.argv[0], [...process.execArgv, ...process.argv.slice(1)], {
            cwd: process.cwd(), stdio: 'inherit', detached: true
        }).unref()
    }
    process.exit(0)
}

let handler = async (m, { sock, command, text, prefix }) => {
    if (command === 'restart') {
        await m.reply('Restarting...')
        return setTimeout(restart, 1500)
    }

    // .broadcast <teks>  -> kirim ke semua grup yang diikuti bot
    if (!text) return m.reply(`Contoh: ${prefix || '.'}broadcast Halo semua!`)
    const groups = Object.keys(await sock.groupFetchAllParticipating())
    if (!groups.length) return m.reply('Bot tidak ada di grup mana pun.')

    // sock.sendMessage sudah lewat antrean anti-ban, jadi pengiriman otomatis berjeda
    await m.reply(`Mengirim ke ${groups.length} grup. Ini bisa memakan waktu karena ada jeda anti-ban.`)
    let ok = 0
    for (const id of groups) {
        try {
            await sock.sendMessage(id, { text: `*BROADCAST*\n\n${text}` })
            ok++
        } catch {}
        await sleep(500)
    }
    await m.reply(`Broadcast selesai: ${ok}/${groups.length} grup berhasil.`)
}

handler.command = ['restart', 'broadcast', 'bc']
handler.tags = ['owner']
handler.owner = true

export default handler
