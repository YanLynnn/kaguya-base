// Mode bot: .public (semua orang bisa pakai) | .self (hanya owner / nomor bot) | .mode (lihat status + tombol)
import { setPublic } from '../lib/settings.js'

const label = (pub) => (pub ? 'PUBLIC' : 'SELF')

let handler = async (m, { sock, jid, command, prefix }) => {
    const p = prefix || '.'

    if (command === 'public' || command === 'self') {
        const want = command === 'public'
        if (global.public === want) {
            return sendStatus(m, p, `Bot sudah dalam mode *${label(want)}*.`)
        }
        setPublic(want)
        return sendStatus(m, p, want
            ? 'Mode diubah ke *PUBLIC*. Semua orang sekarang bisa memakai bot.'
            : 'Mode diubah ke *SELF*. Sekarang hanya owner yang bisa memakai bot.')
    }

    // .mode  [public|self]
    return sendStatus(m, p, null)
}

async function sendStatus(m, p, info) {
    const pub = global.public === true
    const text = [
        info,
        info ? '' : null,
        `Mode saat ini : *${label(pub)}*`,
        pub ? 'Semua orang bisa memakai command.' : 'Hanya owner yang bisa memakai command.'
    ].filter(v => v !== null).join('\n')

    const buttons = [
        pub
            ? { id: `${p}self`, text: '🔒 Ganti ke SELF' }
            : { id: `${p}public`, text: '🌐 Ganti ke PUBLIC' },
        { id: `${p}menu`, text: '📋 Menu' }
    ]

    try {
        return await m.sendButtons({ title: '⚙️ MODE BOT', text, footer: global.namebot || 'Bot', buttons })
    } catch {
        return m.reply(text)
    }
}

handler.command = ['public', 'self', 'mode']
handler.tags = ['owner']
handler.owner = true

export default handler
