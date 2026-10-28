// Plugin gaya "case". Tambah command baru dengan `case 'nama':` — daftarnya dibaca
// otomatis (untuk routing & menu), tanpa perlu didaftarkan di tempat lain.
// File ini di-hot-reload saat disimpan. Ctx yang tersedia:
//   sock, command, text, args, prefix, reply, isOwner, jid, sender, body

import os from 'os'

export default async function (m, { sock, jid, command, text, args, prefix, reply, isOwner }) {
    switch (command) {

    // Contoh 1: balasan sederhana
    case 'pingcase': {
        const start = Date.now()
        const { key } = await sock.sendMessage(jid, { text: 'Testing...' }, { quoted: m })
        await sock.sendMessage(jid, {
            text: [
                '*PING (CASE)*',
                'Tipe    : case (case.js)',
                `Speed   : ${Date.now() - start} ms`,
                `Node    : ${process.version}`,
                `Host    : ${os.platform()} ${os.arch()}`
            ].join('\n'),
            edit: key
        })
    }
    break

    // Contoh 2: pakai argumen. `.echocase halo dunia`
    // Beberapa nama bisa berbagi satu blok: tulis `case 'a': case 'b': {`
    case 'echocase':
    case 'ulang': {
        if (!text) return reply(`Contoh: ${prefix}${command} halo dunia`)
        await reply(text)
    }
    break

    // Contoh 3: batasi owner di dalam case
    case 'ownercase': {
        if (!isOwner) return reply(global.mess.owner)
        await reply(`Halo owner! Argumen: ${args.length}`)
    }
    break

    }
}
