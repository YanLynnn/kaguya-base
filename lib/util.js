// Fungsi kecil yang dipakai banyak plugin.

export const digits = (v) => String(v || '').replace(/\D/g, '')

// target dari mention / reply / nomor yang diketik. Mengembalikan jid nomor atau null.
export function getTarget(m, text = '') {
    const mention = m.mentionedJid?.[0]
    if (mention) return mention
    if (m.quoted?.sender) return m.quoted.sender
    const num = digits(text.split(/\s+/)[0])
    return num.length >= 8 ? `${num}@s.whatsapp.net` : null
}

export const numberOf = (jid) => digits(String(jid || '').split('@')[0])

// kirim pesan bertombol, kalau gagal jatuh ke teks biasa
export async function panel(m, { title = '', text, buttons = [], footer = global.namebot || 'Bot' }) {
    try {
        return await m.sendButtons({ title, text, footer, buttons })
    } catch {
        return m.reply([title && `*${title}*`, text].filter(Boolean).join('\n\n'))
    }
}
