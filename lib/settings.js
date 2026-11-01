// Simpan pengaturan yang bisa diubah dari chat (mode public/self) ke settings.json
// supaya tidak kembali ke nilai config.js setelah bot restart.
// Di-import setelah config.js, jadi nilai di sini menimpa default config.

import fs from 'fs'
import path from 'path'

const file = path.resolve('settings.json')

const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
}

export function loadSettings() {
    const s = read()
    if (typeof s.public === 'boolean') global.public = s.public
}

export function saveSetting(key, value) {
    const s = read()
    s[key] = value
    try { fs.writeFileSync(file, JSON.stringify(s, null, 2)) } catch {}
}

export function setPublic(value) {
    global.public = !!value
    saveSetting('public', global.public)
    return global.public
}

loadSettings()
