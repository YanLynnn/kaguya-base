// .tiktok <link> : unduh video TikTok tanpa watermark.
// Memakai API pihak ketiga (global.api.tiktok di config.js). Kalau layanannya berubah / mati,
// ganti URL-nya atau sesuaikan bagian parsing di bawah.
let handler = async (m, { sock, jid, text, prefix, command }) => {
    if (!/https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(text || '')) {
        return m.reply(`Contoh: ${prefix || '.'}${command} https://vt.tiktok.com/xxxx`)
    }

    const api = global.api?.tiktok || 'https://www.tikwm.com/api/'
    const res = await fetch(`${api}?url=${encodeURIComponent(text.trim())}&hd=1`)
    const json = await res.json().catch(() => null)
    const d = json?.data
    if (!d) throw new Error(json?.msg || 'Gagal mengambil data TikTok.')

    const caption = `*TIKTOK*\n${d.title || ''}\n\n@${d.author?.unique_id || '-'}`
    const base = new URL(api).origin
    const abs = (u) => (u && u.startsWith('/') ? base + u : u)

    // postingan slideshow = kumpulan gambar
    if (Array.isArray(d.images) && d.images.length) {
        await m.reply(caption)
        for (const img of d.images.slice(0, 10)) await sock.sendMessage(jid, { image: { url: abs(img) } })
        return
    }

    const video = abs(d.hdplay || d.play)
    if (!video) throw new Error('Link video tidak ditemukan.')
    await sock.sendMessage(jid, { video: { url: video }, caption }, { quoted: m })
}

handler.command = ['tiktok', 'tt']
handler.tags = ['downloader']
handler.cooldown = 10

export default handler
