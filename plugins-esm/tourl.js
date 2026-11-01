// .tourl : upload gambar/video/file ke catbox.moe lalu kirim link-nya.
// Layanan pihak ketiga: file jadi publik dan bisa diakses siapa saja yang punya link.
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'application/pdf': 'pdf' }

let handler = async (m, { prefix, command }) => {
    const src = m.isMedia ? m : (m.quoted?.isMedia ? m.quoted : null)
    if (!src) return m.reply(`Kirim atau reply media dengan caption *${prefix || '.'}${command}*`)

    const buffer = await src.download()
    if (buffer.length > 20 * 1024 * 1024) return m.reply('Ukuran file maksimal 20 MB.')

    const mime = String(src.mimetype || '').split(';')[0]
    const form = new FormData()
    form.append('reqtype', 'fileupload')
    form.append('fileToUpload', new Blob([buffer], { type: mime }), `file.${EXT[mime] || 'bin'}`)

    const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form })
    const url = (await res.text()).trim()
    if (!res.ok || !/^https?:\/\//.test(url)) throw new Error(`Upload gagal: ${url.slice(0, 100) || res.status}`)

    await m.sendButtons({
        text: `Berhasil diupload.\n\n${url}`,
        footer: global.namebot || 'Bot',
        buttons: [{ copy: url, text: '📋 Salin link' }, { url, text: '🔗 Buka' }]
    }).catch(() => m.reply(url))
}

handler.command = ['tourl', 'upload']
handler.tags = ['tools']
handler.cooldown = 10

export default handler
