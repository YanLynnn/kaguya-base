// Konversi gambar / video / gif -> stiker WebP 512x512.
//   Gambar : butuh paket `sharp` (sudah ada di package.json)
//   Video  : butuh program `ffmpeg` terpasang di server
//   Nama pack/author : butuh paket `node-webpmux`
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'

const tmp = (ext) => path.join(os.tmpdir(), `stk-${crypto.randomBytes(6).toString('hex')}${ext}`)

async function imageToWebp(buf) {
    let sharp
    try { sharp = (await import('sharp')).default } catch { throw new Error('Paket "sharp" belum terpasang. Jalankan: npm install') }
    return sharp(buf, { animated: true })
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 70 })
        .toBuffer()
}

function videoToWebp(buf) {
    return new Promise((resolve, reject) => {
        const input = tmp('.mp4')
        const output = tmp('.webp')
        fs.writeFileSync(input, buf)
        const cleanup = () => { for (const f of [input, output]) try { fs.rmSync(f, { force: true }) } catch {} }

        const ff = spawn('ffmpeg', [
            '-y', '-i', input, '-t', '8', '-an',
            '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
            '-loop', '0', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '40', '-preset', 'default',
            output
        ])
        ff.on('error', (e) => { cleanup(); reject(new Error(e.code === 'ENOENT' ? 'ffmpeg belum terpasang di server (dibutuhkan untuk stiker video).' : e.message)) })
        ff.on('close', (code) => {
            try {
                if (code !== 0 || !fs.existsSync(output)) throw new Error('ffmpeg gagal mengonversi video.')
                resolve(fs.readFileSync(output))
            } catch (e) { reject(e) } finally { cleanup() }
        })
    })
}

// tempel nama pack & author ke metadata stiker
async function addExif(webp, pack, author) {
    let mod
    try { mod = await import('node-webpmux') } catch { return webp }
    const Image = mod.Image || mod.default?.Image
    if (!Image) return webp

    const json = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': pack,
        'sticker-pack-publisher': author,
        emojis: ['✨']
    }
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const body = Buffer.from(JSON.stringify(json), 'utf8')
    const exif = Buffer.concat([head, body])
    exif.writeUIntLE(body.length, 14, 4)

    const img = new Image()
    await img.load(webp)
    img.exif = exif
    return img.save(null)
}

export async function makeSticker(buffer, { video = false, pack = global.namebot || 'Bot', author = global.ownername || '' } = {}) {
    const webp = video ? await videoToWebp(buffer) : await imageToWebp(buffer)
    try { return await addExif(webp, pack, author) } catch { return webp }
}
