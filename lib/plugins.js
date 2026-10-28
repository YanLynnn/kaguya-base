import fs from 'fs'
import os from 'os'
import path from 'path'
import chalk from 'chalk'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = path.join(rootDir, 'plugins')
const caseFile = path.join(rootDir, 'case.js')
const require = createRequire(import.meta.url)

// Struktur folder plugins/ (tiap tipe dipisah):
//   plugins/esm/*.js|.mjs     -> ESM         export default handler
//   plugins/cjs/*.cjs         -> CommonJS    module.exports = handler
//   plugins/typescript/*.ts   -> TypeScript  export default handler (di-transpile otomatis)
// Subfolder di dalam tiap tipe boleh dipakai untuk merapikan.
// Plus gaya "case": file case.js di root project.
// Tipe ditentukan dari ekstensi file, folder hanya untuk merapikan.
const EXT = ['.js', '.mjs', '.cjs', '.ts']

// ───────── global.plugins: setiap perubahan (termasuk dari plugins/owner/plugin.js) menandai index kedaluwarsa ─────────
let dirty = true
global.plugins = new Proxy({}, {
    set(t, k, v) { t[k] = v; dirty = true; return true },
    deleteProperty(t, k) { delete t[k]; dirty = true; return true }
})

// index command -> plugin supaya pencarian O(1), bukan menyisir semua plugin
const byCommand = new Map()
const byRegex = []
function rebuild() {
    byCommand.clear()
    byRegex.length = 0
    for (const plugin of Object.values(global.plugins)) {
        if (typeof plugin !== 'function' || plugin.disabled || !plugin.command) continue
        for (const c of [].concat(plugin.command)) {
            if (c instanceof RegExp) byRegex.push([c, plugin])
            else if (typeof c === 'string') {
                const key = c.toLowerCase()
                if (!byCommand.has(key)) byCommand.set(key, plugin)
            }
        }
    }
    dirty = false
}

export function findPlugin(command) {
    if (dirty) rebuild()
    return byCommand.get(command) || byRegex.find(([re]) => re.test(command))?.[1] || null
}

export function matchPlugin(plugin, command) {
    const cmd = plugin?.command
    if (!cmd || plugin.disabled) return false
    return [].concat(cmd).some(c => (c instanceof RegExp ? c.test(command) : String(c).toLowerCase() === command))
}

// ───────── util file ─────────
const keyOf = (file) => '/' + path.relative(pluginsDir, file).replace(/\\/g, '/')
const isPluginFile = (name) => EXT.includes(path.extname(name)) && !name.endsWith('.d.ts') && !path.basename(name).startsWith('.')

function walk(dir) {
    const out = []
    if (!fs.existsSync(dir)) return out
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) out.push(...walk(full))
        else if (isPluginFile(item.name)) out.push(full)
    }
    return out
}

// ───────── TypeScript -> JavaScript ─────────
// Hasil transpile ditulis ke folder cache (bukan di sebelah file asli) supaya tetap jalan di panel/hosting
// yang folder plugins/-nya read-only (EACCES). Import relatif di-rewrite jadi path absolut.
const cacheCandidates = [path.join(rootDir, '.cache', 'ts'), path.join(os.tmpdir(), 'kaguya-ts')]
let cacheDir = null
function getCacheDir() {
    if (cacheDir) return cacheDir
    for (const dir of cacheCandidates) {
        try {
            fs.mkdirSync(dir, { recursive: true })
            fs.accessSync(dir, fs.constants.W_OK)
            return (cacheDir = dir)
        } catch {}
    }
    throw new Error('tidak ada folder yang bisa ditulis untuk cache TypeScript')
}
const tsOut = (file) => path.join(getCacheDir(), keyOf(file).slice(1).replace(/[\\/]/g, '__') + '.mjs')

// ubah import relatif ('../../lib/x.js') menjadi URL absolut karena file hasil transpile ada di folder cache
function absolutizeImports(code, file) {
    const dir = path.dirname(file)
    const abs = (spec) => pathToFileURL(path.resolve(dir, spec)).href
    return code
        .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]*)\2/g, (_, a, q, spec) => `${a}${q}${abs(spec)}${q}`)
        .replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"]*)\2/g, (_, a, q, spec) => `${a}${q}${abs(spec)}${q}`)
        .replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g, (_, a, q, spec) => `${a}${q}${abs(spec)}${q}`)
}

export async function transpile(source, file) {
    try {
        const ts = (await import('typescript')).default
        return ts.transpileModule(source, {
            fileName: file,
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
        }).outputText
    } catch (e) {
        if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e
    }
    const mod = await import('module')
    if (typeof mod.stripTypeScriptTypes === 'function') {
        return mod.stripTypeScriptTypes(source, { mode: 'transform' })
    }
    throw new Error('Plugin TypeScript butuh paket "typescript" (npm i typescript) atau Node.js 22.13+')
}

// ───────── loader per tipe ─────────
export async function loadPluginModule(file) {
    const ext = path.extname(file)

    if (ext === '.cjs') {
        delete require.cache[require.resolve(file)]
        const mod = require(file)
        return typeof mod === 'function' ? mod : mod?.default
    }

    if (ext === '.ts') {
        const out = tsOut(file)
        fs.writeFileSync(out, absolutizeImports(await transpile(fs.readFileSync(file, 'utf8'), file), file))
        return (await import(`${pathToFileURL(out).href}?update=${Date.now()}`)).default
    }

    return (await import(`${pathToFileURL(file).href}?update=${Date.now()}`)).default
}

async function load(file) {
    try {
        const plugin = await loadPluginModule(file)
        if (typeof plugin !== 'function') throw new Error('tidak ada export default berupa function')
        global.plugins[keyOf(file)] = plugin
    } catch (e) {
        console.log(chalk.red(`[ PLUGIN ] gagal load ${keyOf(file)}: ${e.message}`))
    }
}

export function unloadPlugin(file) {
    delete global.plugins[keyOf(file)]
    if (path.extname(file) === '.ts') { try { fs.rmSync(tsOut(file), { force: true }) } catch {} }
}
const unload = unloadPlugin

// tipe plugin dari ekstensi: 'esm' | 'cjs' | 'typescript'
export const pluginTypeOf = (file) => {
    const ext = path.extname(file)
    return ext === '.cjs' ? 'cjs' : ext === '.ts' ? 'typescript' : 'esm'
}
export const PLUGIN_EXT = EXT

// ───────── case.js ─────────
// Daftar case dibaca otomatis dari `case 'nama':` di file case.js (komentar diabaikan).
let caseFn = null
let caseNames = new Set()

async function loadCase() {
    if (!fs.existsSync(caseFile)) { caseFn = null; caseNames = new Set(); return }
    try {
        const src = fs.readFileSync(caseFile, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
        const names = new Set()
        for (const x of src.matchAll(/\bcase\s+(['"`])([^'"`]+)\1\s*:/g)) names.add(x[2].toLowerCase())

        const mod = await import(`${pathToFileURL(caseFile).href}?update=${Date.now()}`)
        if (typeof mod.default !== 'function') throw new Error('tidak ada export default berupa function')
        caseFn = mod.default
        caseNames = names
    } catch (e) {
        console.log(chalk.red(`[ CASE ] gagal load case.js: ${e.message}`))
    }
}

export const findCase = (command) => (caseFn && caseNames.has(command) ? caseFn : null)

// ───────── statistik untuk menu ─────────
export function pluginStats() {
    const keys = Object.keys(global.plugins)
    let commands = 0
    const seen = new Set()
    for (const plugin of Object.values(global.plugins)) {
        if (typeof plugin !== 'function' || plugin.disabled || seen.has(plugin)) continue
        seen.add(plugin)
        commands += [].concat(plugin.command || []).filter(c => typeof c === 'string' && !c.includes('_')).length
    }
    return {
        files: keys.length,
        esm: keys.filter(k => !k.endsWith('.cjs') && !k.endsWith('.ts')).length,
        cjs: keys.filter(k => k.endsWith('.cjs')).length,
        ts: keys.filter(k => k.endsWith('.ts')).length,
        cases: caseNames.size,
        caseList: [...caseNames].sort(),
        commands: commands + caseNames.size
    }
}

// ───────── mulai: muat semua + hot reload ─────────
export async function initPlugins() {
    fs.mkdirSync(pluginsDir, { recursive: true })
    for (const file of walk(pluginsDir)) await load(file)
    await loadCase()

    const timers = new Map()
    const debounce = (key, fn) => {
        clearTimeout(timers.get(key))
        timers.set(key, setTimeout(fn, 200))
    }

    try {
        fs.watch(pluginsDir, { recursive: true }, (_, name) => {
            if (!name) return
            const file = path.join(pluginsDir, name)
            if (!isPluginFile(file) || name.split(path.sep).some(s => s.startsWith('.'))) return
            debounce(file, async () => (fs.existsSync(file) ? load(file) : unload(file)))
        })
    } catch {
        // watch rekursif tidak didukung di sistem ini; plugin tetap termuat saat start
    }
    try {
        fs.watch(rootDir, (_, name) => { if (name === 'case.js') debounce(caseFile, loadCase) })
    } catch {}

    const s = pluginStats()
    console.log(chalk.greenBright(`[ PLUGIN ] ${s.files} plugin (ESM ${s.esm}, CJS ${s.cjs}, TS ${s.ts}) + ${s.cases} case`))
}

// ───────── parse command ─────────
export function parseCommand(body = '') {
    const list = [].concat(global.prefix ?? ['.']).map(String)
    const ordered = [...list.filter(Boolean).sort((a, b) => b.length - a.length), ...list.filter(p => !p)]
    for (const prefix of ordered) {
        if (!body.startsWith(prefix)) continue
        const rest = body.slice(prefix.length).trimStart()
        if (!rest) continue
        const command = rest.split(/\s+/)[0].toLowerCase()
        const text = rest.slice(command.length).replace(/^[ \t]+/, '')
        return { isCmd: true, prefix, command, text }
    }
    return { isCmd: false, prefix: '', command: '', text: body }
}

// ═════════ Konversi plugin antar tipe: esm <-> cjs <-> typescript ═════════
// Berbasis regex untuk pola umum plugin (import/export default/require/module.exports).
// Hasil disertai `warnings` untuk bagian yang perlu dicek manual. ESM valid sebagai TS, jadi ESM -> TS tidak diubah.

export const TYPE_EXT = { esm: '.js', cjs: '.cjs', typescript: '.ts' }
export const TYPE_ALIAS = { esm: 'esm', js: 'esm', mjs: 'esm', cjs: 'cjs', commonjs: 'cjs', ts: 'typescript', typescript: 'typescript' }

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// tebak gaya penulisan source: 'esm' | 'cjs' | 'typescript'
export function detectSyntax(code = '', fileName = '') {
    const ext = fileName.match(/\.[a-z]+$/i)?.[0]?.toLowerCase()
    if (ext === '.cjs') return 'cjs'
    if (ext === '.ts') return 'typescript'
    if (ext === '.js' || ext === '.mjs') return 'esm'
    const src = stripComments(code)
    const hasEsm = /^\s*(import\s|export\s)/m.test(src)
    const hasCjs = /\bmodule\.exports\b|\bexports\.\w+\s*=|\brequire\s*\(/.test(src)
    if (hasCjs && !hasEsm) return 'cjs'
    if (/^\s*import\s+type\b|\binterface\s+\w+\s*[{<]|\)\s*:\s*(Promise<|void|string|number|boolean|any)\b|:\s*Handler\b|\bas\s+(any|string|number|const)\b/m.test(src)) return 'typescript'
    return 'esm'
}

// letak aman untuk menyisipkan kode setelah blok import (atau setelah komentar di awal file)
function insertAfterImports(code, text) {
    const re = /^[ \t]*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"][ \t]*;?[ \t]*$/gm
    let end = -1
    for (const m of code.matchAll(re)) end = m.index + m[0].length
    if (end < 0) {
        const lead = code.match(/^(?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)?[ \t]*\n)*/)[0]
        end = lead.length ? lead.length - 1 : -1
        return end < 0 ? `${text}\n${code}` : `${code.slice(0, end)}\n${text}${code.slice(end)}`
    }
    return `${code.slice(0, end)}\n${text}${code.slice(end)}`
}

// ───────── ESM -> CJS ─────────
function esmToCjs(src, warnings) {
    let code = src
    let lazy = 0

    code = code.replace(/^[ \t]*import\s+type\s+[^\n]*?from\s+['"][^'"]+['"]\s*;?[ \t]*\n?/gm, '')
    code = code.replace(/^([ \t]*)import\s+(['"][^'"]+['"])[ \t]*;?/gm, '$1require($2)')

    code = code.replace(/^([ \t]*)import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\3[ \t]*;?/gm, (_, ind, clause, q, spec) => {
        clause = clause.trim()
        const isRel = spec.startsWith('.')
        // file relatif .js di project ini adalah ESM -> tidak bisa di-require, pakai dynamic import
        if (isRel && !/\.(cjs|json)$/.test(spec)) {
            const n = lazy++
            warnings.push(`import relatif '${spec}' jadi loader lazy: di dalam fungsi pakai "const ${clause.replace(/^\*\s+as\s+/, '')} = await __esm${n}()"`)
            return `${ind}const __esm${n} = () => import(${q}${spec}${q}) // TODO: ${clause}`
        }
        const req = `require(${q}${spec}${q})`
        let def = null, ns = null, named = null
        const braces = clause.match(/\{([\s\S]*)\}/)
        if (braces) {
            named = braces[1].split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': ')).join(', ')
            clause = clause.replace(braces[0], '').replace(/,\s*$/, '').trim()
        }
        const star = clause.match(/\*\s+as\s+(\w+)/)
        if (star) { ns = star[1]; clause = clause.replace(star[0], '').replace(/,\s*$/, '').trim() }
        if (clause) def = clause.replace(/,$/, '').trim()

        const base = def || ns
        const lines = []
        if (base) lines.push(`const ${base} = ${req}`)
        if (def && ns) lines.push(`const ${ns} = ${def}`)
        if (named) lines.push(base ? `const { ${named} } = ${base}` : `const { ${named} } = ${req}`)
        return lines.map(l => ind + l).join('\n')
    })

    code = code.replace(/^[ \t]*const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\)[ \t]*;?[ \t]*\n/gm, '')
    code = code.replace(/^[ \t]*const\s+__dirname\s*=\s*[^\n]*\n/gm, (line) => (/__filename|import\.meta/.test(line) ? '' : line))
    code = code.replace(/import\.meta\.dirname/g, '__dirname')
        .replace(/import\.meta\.filename/g, '__filename')
        .replace(/import\.meta\.url/g, "require('url').pathToFileURL(__filename).href")

    const named = []
    code = code.replace(/^([ \t]*)export\s+default\s+/gm, '$1module.exports = ')
    code = code.replace(/^([ \t]*)export\s+((?:async\s+)?function\*?|class|const|let|var)\s+(\w+)/gm, (_, ind, kw, name) => { named.push(name); return `${ind}${kw} ${name}` })
    code = code.replace(/^([ \t]*)export\s*\{([^}]*)\}[ \t]*;?/gm, (_, ind, list) => {
        for (const part of list.split(',').map(s => s.trim()).filter(Boolean)) {
            const [a, b] = part.split(/\s+as\s+/)
            named.push(b ? `${b}=${a}` : a)
        }
        return ''
    })
    if (named.length) {
        code += '\n' + named.map(n => { const [out, local = out] = n.split('='); return `module.exports.${out} = ${local}` }).join('\n') + '\n'
        warnings.push(`named export (${named.map(n => n.split('=')[0]).join(', ')}) ditempel sebagai properti module.exports`)
    }
    if (/^await\s/m.test(stripComments(code))) warnings.push('ada top-level await, tidak didukung di CJS: bungkus dalam async function')
    return code
}

// ───────── CJS -> ESM ─────────
function cjsToEsm(src, warnings) {
    let code = src
    const tail = '(?![ \\t]*[.(\\[])'

    code = code.replace(new RegExp(`^([ \\t]*)(?:const|let|var)\\s+\\{([^}]*)\\}\\s*=\\s*require\\((['"])([^'"]+)\\3\\)${tail}[ \\t]*;?`, 'gm'), (_, ind, names, q, spec) =>
        `${ind}import { ${names.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s*:\s*/, ' as ')).join(', ')} } from ${q}${spec}${q}`)
    code = code.replace(/^([ \t]*)(?:const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)\.(\w+)[ \t]*;?/gm, (_, ind, name, q, spec, prop) =>
        `${ind}import { ${prop === name ? name : `${prop} as ${name}`} } from ${q}${spec}${q}`)
    code = code.replace(new RegExp(`^([ \\t]*)(?:const|let|var)\\s+(\\w+)\\s*=\\s*require\\((['"])([^'"]+)\\3\\)${tail}[ \\t]*;?`, 'gm'),
        (_, ind, name, q, spec) => `${ind}import ${name} from ${q}${spec}${q}`)
    code = code.replace(new RegExp(`^([ \\t]*)require\\((['"])([^'"]+)\\2\\)${tail}[ \\t]*;?`, 'gm'), (_, ind, q, spec) => `${ind}import ${q}${spec}${q}`)

    code = code.replace(/^([ \t]*)(?:module\.)?exports\.default\s*=\s*/gm, '$1export default ')
    code = code.replace(/^([ \t]*)module\.exports\s*=\s*/gm, '$1export default ')
    code = code.replace(/^([ \t]*)(?:module\.)?exports\.(\w+)\s*=\s*/gm, (_, ind, name) => {
        warnings.push(`exports.${name} jadi named export`)
        return `${ind}export const ${name} = `
    })

    const bare = stripComments(code)
    const header = []
    if (/\b__filename\b|\b__dirname\b/.test(bare)) {
        header.push(
            "import { fileURLToPath as __f2p } from 'url'",
            "import { dirname as __dnm } from 'path'",
            'const __filename = __f2p(import.meta.url)',
            'const __dirname = __dnm(__filename)'
        )
    }
    if (/\brequire\s*\(/.test(bare)) {
        header.push("import { createRequire } from 'module'", 'const require = createRequire(import.meta.url)')
        warnings.push('masih ada require() di dalam fungsi, dipertahankan lewat createRequire')
    }
    if (header.length) code = insertAfterImports(code, header.join('\n'))
    return code
}

// ───────── pintu utama ─────────
// from/to: 'esm' | 'cjs' | 'typescript'. Return { code, warnings }
export async function convertPlugin(source, from, to) {
    from = TYPE_ALIAS[from] || from
    to = TYPE_ALIAS[to] || to
    const warnings = []
    if (!TYPE_EXT[from] || !TYPE_EXT[to]) throw new Error(`tipe tidak dikenal: ${from} -> ${to}`)
    if (from === to) return { code: source, warnings }

    // 1) normalisasi ke ESM
    let esm = source
    if (from === 'cjs') esm = cjsToEsm(source, warnings)
    else if (from === 'typescript') esm = await transpile(source, 'plugin.ts')

    // 2) ESM -> tipe tujuan
    let code = esm
    if (to === 'cjs') code = esmToCjs(esm, warnings)

    return { code: code.replace(/\s+$/, '') + '\n', warnings }
}
