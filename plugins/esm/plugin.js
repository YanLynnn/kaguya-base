import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadPluginModule, unloadPlugin, pluginTypeOf, PLUGIN_EXT, convertPlugin, detectSyntax, TYPE_EXT, TYPE_ALIAS } from '../../lib/plugins.js'

const __filename = fileURLToPath(import.meta.url)
// root folder plugins/ (file ini ada di plugins/esm/)
const pluginDir = path.resolve(path.dirname(__filename), '..')
const TITLE = 'Plugin Manager'

// folder per tipe + ekstensi yang boleh di dalamnya
const TYPES = {
    esm: { folder: 'esm', exts: ['.js', '.mjs'], mime: 'application/javascript' },
    cjs: { folder: 'cjs', exts: ['.cjs'], mime: 'application/javascript' },
    typescript: { folder: 'typescript', exts: ['.ts'], mime: 'text/plain' }
}
const FOLDER_ALIAS = { esm: 'esm', cjs: 'cjs', typescript: 'typescript', ts: 'typescript' }

const USAGE = `*Plugin dipisah per tipe* (dari ekstensi)
.js/.mjs -> plugins/esm/   .cjs -> plugins/cjs/   .ts -> plugins/typescript/

*Tambah*
.addplugin halo.js
<kode>  (atau kirim / reply file, atau reply pesan berisi kode)
.addplugin tools/halo.cjs  (pakai subfolder bebas)
Kode beda tipe dengan ekstensi tujuan otomatis dikonversi.

*Edit*
.editplugin halo.js  (tanpa isi = lihat kode)
.editplugin halo.js <kode baru>
.editplugin halo.js lama => baru

*Ambil*
.getplugin halo  (nama file / command)
.getplugin esm  (isi folder)

*Konversi tipe*
.convertplugin halo.js cjs  (esm | cjs | ts)
tambah "move" = pindah, "timpa" = boleh menimpa tujuan

*Lainnya*
.delplugin halo.js
.listplugin`

const isDeclaration = (name) => name.endsWith('.d.ts')

// "halo.js" -> /abs/plugins/esm/halo.js, "tools/halo.cjs" -> /abs/plugins/cjs/tools/halo.cjs (tipe dari ekstensi atau awalan folder tipe)
function resolvePlugin(input = '') {
    let name = input.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!name || !/^[\w\-./]+$/.test(name) || name.includes('..')) return null

    const parts = name.split('/')
    const alias = parts.length > 1 ? FOLDER_ALIAS[parts[0].toLowerCase()] : null
    if (alias) parts.shift()

    let base = parts[parts.length - 1]
    let ext = path.extname(base)
    if (!ext) {
        ext = alias === 'cjs' ? '.cjs' : alias === 'typescript' ? '.ts' : '.js'
        parts[parts.length - 1] = base += ext
    }
    if (!PLUGIN_EXT.includes(ext) || isDeclaration(base)) return null

    const type = pluginTypeOf(base)
    if (alias && alias !== type) return null // mis. plugins/cjs/halo.js tidak valid

    const full = path.resolve(pluginDir, TYPES[type].folder, ...parts)
    if (!full.startsWith(pluginDir + path.sep)) return null
    return full
}

function walk(dir) {
    let out = []
    if (!fs.existsSync(dir)) return out
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) out.push(...walk(full))
        else if (PLUGIN_EXT.includes(path.extname(item.name)) && !isDeclaration(item.name)) out.push(full)
    }
    return out
}

const rel = file => path.relative(pluginDir, file).replace(/\\/g, '/')
// kunci plugin di global.plugins (sama dengan loader di lib/plugins.js)
const keyOf = file => '/' + rel(file)
const isManager = file => path.resolve(file) === __filename

function pickDoc(m) {
    if (m.mtype === 'documentMessage') return { fileName: m.msg?.fileName || '', download: m.download }
    if (m.quoted?.mtype === 'documentMessage') return { fileName: m.quoted.fileName || '', download: m.quoted.download }
    return null
}

const isPluginName = (name = '') => PLUGIN_EXT.includes(path.extname(name)) && !isDeclaration(name)

function cleanCode(code = '') {
    return code
        .replace(/^\s*```[a-z]*[ \t]*\r?\n?/i, '')
        .replace(/\r?\n?```\s*$/, '')
        .trim()
}

// kode harus punya export sesuai tipenya
function exportError(target, code) {
    if (pluginTypeOf(target) === 'cjs') {
        return /module\.exports|exports\.default/.test(code) ? null : 'Plugin CJS harus punya `module.exports = handler`.'
    }
    return /export\s+default/.test(code) ? null : 'Plugin harus punya `export default handler`.'
}

// samakan kode dengan tipe file tujuan; kalau beda gaya (CJS/ESM/TS) otomatis dikonversi
async function fitCode(target, code, hintName = '') {
    const to = pluginTypeOf(target)
    const err = exportError(target, code)
    const from = hintName && isPluginName(hintName) ? pluginTypeOf(hintName) : (err ? detectSyntax(code) : to)
    if (from === to) return err ? { error: err } : { code }
    const r = await convertPlugin(code, from, to)
    if (exportError(target, r.code)) return { error: err || exportError(target, r.code) }
    return { code: r.code, converted: `${from.toUpperCase()} → ${to.toUpperCase()}`, warnings: r.warnings }
}

const convNote = (fit) => fit.converted
    ? `\n🔁 Auto-convert ${fit.converted}` + (fit.warnings?.length ? `\n⚠️ ${fit.warnings.join('\n⚠️ ')}` : '')
    : ''

const commandsOf = (plugin, p) =>
    (Array.isArray(plugin.command) ? plugin.command : plugin.command ? [plugin.command] : [])
        .filter(c => typeof c === 'string').map(c => p + c)

// tulis kode ke file lalu load; kalau gagal load, file dikembalikan seperti semula
async function writeAndLoad(target, code) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const existed = fs.existsSync(target)
    const backup = existed ? fs.readFileSync(target) : null
    fs.writeFileSync(target, code)

    try {
        const plugin = await loadPluginModule(target)
        if (typeof plugin !== 'function') throw new Error('Plugin tidak punya export default berupa function')
        global.plugins[keyOf(target)] = plugin // langsung aktif, watcher ikut me-reload
        return { ok: true, existed, plugin }
    } catch (e) {
        if (backup) fs.writeFileSync(target, backup)
        else { fs.unlinkSync(target); unloadPlugin(target) }
        return { ok: false, existed, error: e }
    }
}

async function addPlugin(m, { prefix, firstToken, rest, notifReply }) {
    const doc = pickDoc(m)
    let target, code

    if (doc) {
        if (!isPluginName(doc.fileName) && !isPluginName(firstToken)) {
            return notifReply('File harus berformat .js / .mjs / .cjs / .ts', TITLE)
        }
        const relPath = isPluginName(firstToken)
            ? firstToken
            : (firstToken ? `${firstToken}/${doc.fileName}` : doc.fileName)
        target = resolvePlugin(relPath)
        if (!target) return notifReply('Nama / path plugin tidak valid. Pakai huruf, angka, _ - . dan /', TITLE)
        code = (await doc.download()).toString('utf8')
    } else {
        if (!firstToken) return notifReply(USAGE, TITLE)
        target = resolvePlugin(firstToken)
        if (!target) return notifReply('Nama / path plugin tidak valid. Pakai huruf, angka, _ - . dan /', TITLE)
        code = rest || m.quoted?.text || ''
    }

    code = cleanCode(code)
    if (!code) return notifReply(USAGE, TITLE)
    if (isManager(target)) return notifReply('Plugin manager tidak bisa ditimpa lewat command ini.', TITLE)
    const fit = await fitCode(target, code, doc?.fileName)
    if (fit.error) return notifReply(fit.error, TITLE)

    const result = await writeAndLoad(target, fit.code)
    if (!result.ok) {
        return notifReply(`Gagal load plugin, dibatalkan${result.existed ? ' (file lama dikembalikan)' : ''}.\n\n${result.error.name}: ${result.error.message}`, TITLE)
    }

    const cmds = commandsOf(result.plugin, prefix || '.')
    await notifReply(
        `✅ Plugin ${result.existed ? 'diperbarui' : 'ditambahkan'} (${pluginTypeOf(target).toUpperCase()})\n\n📁 plugins/${rel(target)}\n` +
        (cmds.length ? `⌨️ ${cmds.join(', ')}` : '') + convNote(fit),
        TITLE
    )
}

// cari file plugin: path lengkap dulu, lalu nama file saja (dengan / tanpa ekstensi)
function findTarget(input) {
    const target = resolvePlugin(input)
    if (target && fs.existsSync(target)) return { target }

    const name = path.basename(input.replace(/\\/g, '/'))
    const wanted = isPluginName(name) ? [name] : PLUGIN_EXT.map(e => name + e)
    const found = walk(pluginDir).filter(f => wanted.includes(path.basename(f)))
    if (found.length > 1) return { ambiguous: found }
    return { target: found[0] || null }
}

async function editPlugin(m, { prefix, firstToken, rest, notifReply, sock }) {
    if (!firstToken) return notifReply(USAGE, TITLE)

    const { target, ambiguous } = findTarget(firstToken)
    if (ambiguous) {
        return notifReply(`Ada ${ambiguous.length} file dengan nama itu, tulis path lengkap:\n\n${ambiguous.map(rel).join('\n')}`, TITLE)
    }
    if (!target) return notifReply('Plugin tidak ditemukan. Cek nama lewat .listplugin, atau pakai .addplugin untuk membuat baru.', TITLE)
    if (isManager(target)) return notifReply('Plugin manager tidak bisa diedit lewat command ini.', TITLE)

    const doc = pickDoc(m)
    const body = (rest || '').trim()
    const quotedText = m.quoted?.text || ''

    // ── mode 1: lihat kode sekarang ──
    if (!doc && !body && !quotedText) {
        const current = fs.readFileSync(target, 'utf8')
        if (current.length <= 3000) return notifReply(`📁 plugins/${rel(target)}\n\n\`\`\`${current}\`\`\``, TITLE)
        return sock.sendMessage(m.chat, {
            document: Buffer.from(current),
            fileName: path.basename(target),
            mimetype: TYPES[pluginTypeOf(target)].mime,
            caption: `📁 plugins/${rel(target)}`
        }, { quoted: m })
    }

    let code
    let hint = ''
    let mode = 'timpa'

    if (doc) {
        if (!isPluginName(doc.fileName)) return notifReply('File harus berformat .js / .mjs / .cjs / .ts', TITLE)
        code = (await doc.download()).toString('utf8')
        hint = doc.fileName
    } else {
        const raw = cleanCode(body || quotedText)
        const replaceMatch = body && exportError(target, raw) ? raw.match(/^([^\n]+?)\s*=>\s*([\s\S]*)$/) : null

        if (replaceMatch) {
            // ── mode 2: ganti sebagian ──
            const [, from, to] = replaceMatch
            const current = fs.readFileSync(target, 'utf8')
            if (!current.includes(from)) return notifReply(`Teks yang dicari tidak ketemu:\n${from}`, TITLE)
            const count = current.split(from).length - 1
            code = current.split(from).join(to)
            mode = `ganti ${count} bagian`
        } else {
            code = raw
        }
    }

    code = cleanCode(code)
    if (!code) return notifReply(USAGE, TITLE)
    const fit = await fitCode(target, code, hint)
    if (fit.error) return notifReply(fit.error, TITLE)

    const result = await writeAndLoad(target, fit.code)
    if (!result.ok) {
        return notifReply(`Gagal load plugin, perubahan dibatalkan (file lama dikembalikan).\n\n${result.error.name}: ${result.error.message}`, TITLE)
    }

    const cmds = commandsOf(result.plugin, prefix || '.')
    await notifReply(
        `✏️ Plugin diedit (${mode})\n\n📁 plugins/${rel(target)}\n` +
        (cmds.length ? `⌨️ ${cmds.join(', ')}` : '') + convNote(fit),
        TITLE
    )
}

async function convertCmd(m, { prefix, firstToken, rest, notifReply }) {
    const [toRaw = '', flag = ''] = rest.trim().toLowerCase().split(/\s+/)
    const to = TYPE_ALIAS[toRaw]
    if (!firstToken || !to) {
        return notifReply('Contoh:\n.convertplugin tools/halo.js cjs\n.convertplugin tools/halo.js ts move\n\nTipe tujuan: esm | cjs | ts\n(move = file asli dihapus setelah konversi, timpa = boleh menimpa file tujuan)', TITLE)
    }

    const { target: src, ambiguous } = findTarget(firstToken)
    if (ambiguous) return notifReply(`Ada ${ambiguous.length} file dengan nama itu, tulis path lengkap:\n\n${ambiguous.map(rel).join('\n')}`, TITLE)
    if (!src) return notifReply('Plugin tidak ditemukan. Cek nama lewat .listplugin', TITLE)
    if (isManager(src)) return notifReply('Plugin manager tidak bisa dikonversi lewat command ini.', TITLE)

    const from = pluginTypeOf(src)
    if (from === to) return notifReply(`Plugin itu sudah bertipe ${to.toUpperCase()}.`, TITLE)

    // plugins/<tipe lama>/<kategori>/nama.ext -> plugins/<tipe baru>/<kategori>/nama<ext baru>
    const parts = rel(src).split('/').slice(1)
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^.]+$/, TYPE_EXT[to])
    const dest = path.join(pluginDir, TYPES[to].folder, ...parts)

    const overwrite = /^(timpa|overwrite|force)$/.test(flag) || /^(timpa|overwrite|force)$/.test(rest.trim().toLowerCase().split(/\s+/)[2] || '')
    if (fs.existsSync(dest) && !overwrite) {
        return notifReply(`File tujuan sudah ada, tidak ditimpa:\n📁 plugins/${rel(dest)}\n\nTambahkan kata "timpa" di akhir kalau memang mau menimpa:\n${prefix || '.'}convertplugin ${firstToken} ${toRaw} timpa`, TITLE)
    }

    const { code, warnings } = await convertPlugin(fs.readFileSync(src, 'utf8'), from, to)
    const result = await writeAndLoad(dest, code)
    if (!result.ok) {
        return notifReply(`Konversi gagal saat load, dibatalkan.\n\n${result.error.name}: ${result.error.message}`, TITLE)
    }

    const moved = /^(move|pindah|hapus)$/.test(flag)
    if (moved) { unloadPlugin(src); fs.unlinkSync(src) }

    const cmds = commandsOf(result.plugin, prefix || '.')
    await notifReply(
        `🔁 Konversi ${from.toUpperCase()} → ${to.toUpperCase()} ${moved ? '(dipindah)' : '(file asli tetap ada)'}\n\n` +
        `📁 plugins/${rel(src)}\n➜ plugins/${rel(dest)}\n` +
        (cmds.length ? `⌨️ ${cmds.join(', ')}\n` : '') +
        (warnings.length ? `\n⚠️ ${warnings.join('\n⚠️ ')}\n` : '') +
        (moved ? '' : `\nCommand sama ada di 2 file; pakai "move" atau ${prefix || '.'}delplugin salah satunya.`),
        TITLE
    )
}

async function getPlugin(m, { prefix, firstToken, notifReply, sock }) {
    if (!firstToken) return notifReply('Contoh:\n.getplugin tools/halo.js\n.getplugin halo  (nama file atau nama command)\n.getplugin esm  (tampilkan isi folder)', TITLE)

    // folder (mis. "esm", "cjs/tools") -> tampilkan isi, pilih salah satu
    const dirPath = path.resolve(pluginDir, (FOLDER_ALIAS[firstToken.toLowerCase()] || firstToken).replace(/\\/g, '/').replace(/^\/+/, ''))
    if (dirPath.startsWith(pluginDir + path.sep) && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = walk(dirPath).map(rel).sort()
        if (!files.length) return notifReply('Folder itu kosong.', TITLE)
        return notifReply(`📂 plugins/${rel(dirPath)}/\n\n${files.map(f => `• ${f}`).join('\n')}\n\nAmbil salah satu:\n${prefix || '.'}getplugin ${files[0]}`, TITLE)
    }

    let { target, ambiguous } = findTarget(firstToken)
    if (ambiguous) {
        return notifReply(`Ada ${ambiguous.length} file dengan nama itu, tulis path lengkap:\n\n${ambiguous.map(rel).join('\n')}`, TITLE)
    }

    // tidak ketemu sebagai file -> cari berdasarkan nama command
    if (!target) {
        const cmd = firstToken.toLowerCase()
        const hits = Object.entries(global.plugins || {})
            .filter(([, pl]) => pl && commandsOf(pl, '').some(c => c.toLowerCase() === cmd))
            .map(([key]) => path.join(pluginDir, key.replace(/^[\\/]+/, '')))
            .filter(f => fs.existsSync(f))
        if (hits.length > 1) {
            return notifReply(`Command itu ada di ${hits.length} file, tulis path lengkap:\n\n${hits.map(rel).join('\n')}`, TITLE)
        }
        target = hits[0] || null
    }

    if (!target) return notifReply('Plugin tidak ditemukan. Cek nama lewat .listplugin', TITLE)

    await sock.sendMessage(m.chat, {
        document: fs.readFileSync(target),
        fileName: path.basename(target),
        mimetype: TYPES[pluginTypeOf(target)].mime,
        caption: `📁 plugins/${rel(target)}`
    }, { quoted: m })
}

async function delPlugin(m, { firstToken, notifReply }) {
    if (!firstToken) return notifReply('Contoh:\n.delplugin tools/halo.js', TITLE)

    const { target, ambiguous } = findTarget(firstToken)
    if (ambiguous) {
        return notifReply(`Ada ${ambiguous.length} file dengan nama itu, tulis path lengkap:\n\n${ambiguous.map(rel).join('\n')}`, TITLE)
    }
    if (!target) return notifReply('Plugin tidak ditemukan.', TITLE)
    if (isManager(target)) return notifReply('Plugin manager tidak bisa dihapus lewat command ini.', TITLE)

    unloadPlugin(target)
    fs.unlinkSync(target)
    await notifReply(`🗑️ Plugin dihapus\n\n📁 plugins/${rel(target)}`, TITLE)
}

async function listPlugin(m, { notifReply }) {
    const groups = {}
    for (const f of walk(pluginDir).map(rel).sort()) {
        const dir = path.dirname(f)
        ;(groups[dir] ||= []).push(path.basename(f))
    }
    const text = Object.entries(groups)
        .map(([dir, files]) => `*${dir}/*\n${files.map(f => `• ${f}`).join('\n')}`)
        .join('\n\n')
    await notifReply(text || 'Belum ada plugin.', TITLE)
}

let handler = async (m, { sock, prefix, command, text }) => {
    const notifReply = (t, title = 'Notification') => sock.sendMessage(m.chat, { text: `*${title}*\n\n${t}` }, { quoted: m })
    try {
        const raw = (text || '').replace(/^\s+/, '')
        const firstToken = raw.match(/^\S*/)[0]
        const rest = raw.slice(firstToken.length).replace(/^[ \t]*\r?\n?/, '')
        const ctx = { prefix, firstToken, rest, notifReply, sock }

        if (/^add/.test(command)) return await addPlugin(m, ctx)
        if (/^edit/.test(command)) return await editPlugin(m, ctx)
        if (/^del/.test(command)) return await delPlugin(m, ctx)
        if (/^get/.test(command)) return await getPlugin(m, ctx)
        if (/^convert/.test(command)) return await convertCmd(m, ctx)
        return await listPlugin(m, ctx)
    } catch (e) {
        console.error(e)
        await notifReply(`${e.name}: ${e.message}`, 'Plugin Error')
    }
}

handler.command = ['addplugin', 'editplugin', 'delplugin', 'getplugin', 'listplugin', 'convertplugin']
handler.tags = ['owner']
handler.owner = true

export default handler
