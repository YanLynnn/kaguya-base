// .owner -> kirim kontak owner
let handler = async (m, { sock, jid }) => {
    const list = [].concat(global.owners || [], global.db?.owners || [])
        .map(n => String(n).replace(/\D/g, '')).filter(Boolean)
    const unique = [...new Set(list)]
    if (!unique.length) return m.reply('Owner belum diatur di config.js.')

    const contacts = unique.slice(0, 3).map((num, i) => ({
        vcard: [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${i === 0 ? (global.ownername || 'Owner') : `Owner ${i + 1}`}`,
            `TEL;type=CELL;type=VOICE;waid=${num}:+${num}`,
            'END:VCARD'
        ].join('\n')
    }))

    await sock.sendMessage(jid, {
        contacts: { displayName: global.ownername || 'Owner', contacts }
    }, { quoted: m })
}

handler.command = ['owner', 'creator']
handler.tags = ['main']

export default handler
