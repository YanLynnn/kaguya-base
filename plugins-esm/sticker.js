// .sticker / .s : kirim atau reply gambar / video (maks 10 detik). Nama pack: .sticker pack | author
import { makeSticker } from '../lib/sticker.js'

let handler = async (m, { sock, jid, text, prefix, command }) => {
    const src = m.isMedia ? m : (m.quoted?.isMedia ? m.quoted : null)
    const type = src?.mtype
    if (!src || !['imageMessage', 'videoMessage', 'stickerMessage'].includes(type)) {
        return m.reply(`Kirim atau reply gambar/video dengan caption *${prefix || '.'}${command}*\nGanti nama pack: ${prefix || '.'}${command} pack | author`)
    }

    const video = type === 'videoMessage' || (type === 'stickerMessage' && src.isAnimated)
    if (type === 'videoMessage' && Number(src.seconds || src.msg?.seconds || 0) > 10) {
        return m.reply('Video maksimal 10 detik.')
    }

    const [pack, author] = text ? text.split('|').map(s => s.trim()) : []
    const buffer = await src.download()
    const sticker = await makeSticker(buffer, {
        video,
        ...(pack ? { pack } : {}),
        ...(author !== undefined ? { author } : {})
    })
    await sock.sendMessage(jid, { sticker }, { quoted: m })
}

handler.command = ['sticker', 's', 'stiker']
handler.tags = ['tools']
handler.cooldown = 5

export default handler
