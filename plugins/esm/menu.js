import fs from 'fs'
import path from 'path'
import { pluginStats } from '../../lib/plugins.js'

const readPkg = () => {
    try { return JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) } catch { return {} }
}

// "4 minutes, 34 seconds"
function longRuntime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0))
    return [
        [Math.floor(sec / 86400), 'day'],
        [Math.floor((sec % 86400) / 3600), 'hour'],
        [Math.floor((sec % 3600) / 60), 'minute'],
        [sec % 60, 'second']
    ]
        .filter(([n], i, a) => n > 0 || i === a.length - 1)
        .map(([n, u]) => `${n} ${u}${n === 1 ? '' : 's'}`)
        .join(', ')
}

// kotak bergaya ┌─「 JUDUL 」 ... └────
const infoBox = (title, rows) => [
    `┌─「 ${title} 」`,
    '│',
    ...rows.map(r => (r === null ? '│' : `│ ${r}`)),
    '│',
    '└────────────────────────'
].join('\n')

const kv = (label, value) => `${label.padEnd(10)} : *${value}*`

// kumpulkan command dari semua plugin, dikelompokkan per tags
function collect(isOwner) {
    const groups = new Map()
    for (const h of Object.values(global.plugins || {})) {
        if (!h?.command || h.command instanceof RegExp || h.disabled) continue
        const cmds = [].concat(h.command).filter(c => typeof c === 'string' && !c.includes('_') && !(h.hide || []).includes(c))
        if (!cmds.length) continue

        const tag = Array.isArray(h.tags) ? h.tags[0] : h.tags
        const cat = tag ? String(tag).toLowerCase() : (h.owner ? 'owner' : 'main')
        if ((h.owner || cat === 'owner') && !isOwner) continue

        if (!groups.has(cat)) groups.set(cat, new Set())
        cmds.forEach(c => groups.get(cat).add(c))
    }
    const st = pluginStats()
    if (st.cases) groups.set('case', new Set(st.caseList))
    const order = ['main', ...[...groups.keys()].filter(k => k !== 'main' && k !== 'owner').sort(), 'owner']
    return order.filter(k => groups.has(k)).map(cat => ({ cat, items: [...groups.get(cat)].sort() }))
}

let handler = async (m, { sock, jid, prefix, text, isOwner }) => {
    const p = prefix || '.'
    const groups = collect(isOwner)
    const query = String(text || '').trim().toLowerCase()
    const showAll = query === 'all'
    const category = query && !showAll ? groups.find(g => g.cat === query) : null

    if (query && !showAll && !category) {
        return m.reply(`Kategori *${query}* tidak ditemukan.\n\nTersedia: ${groups.map(g => g.cat).join(', ')}\n\nKetik *${p}menu* untuk lihat daftar menu.`)
    }

    const number = String(m.sender || '').split('@')[0]
    const pkg = readPkg()
    const st = pluginStats()
    const speed = m.receivedAt ? Date.now() - m.receivedAt : 0

    const intro = [
        `Hi, ${m.pushName || 'No Name'}.`,
        '',
        `I'm ${global.namebot || 'Bot'}, your personal assistant.`,
        `I'm here to help you with commands, tools,`,
        `and features available in this bot.`
    ].join('\n')

    const systemBox = infoBox('SYSTEM', [
        kv('Version', pkg.version || '1.0.0'),
        kv('Runtime', longRuntime(process.uptime())),
        kv('Type', pkg.type === 'module' ? 'ESM' : 'CommonJS'),
        kv('Speed', `${speed} ms`),
        null,
        kv('Features', st.files + st.cases),
        kv('Commands', st.commands),
        kv('Cases', st.cases),
        'Plugins',
        `├─ ${'CJS'.padEnd(8)} : *${st.cjs}*`,
        `├─ ${'ESM'.padEnd(8)} : *${st.esm}*`,
        `└─ ${'TS'.padEnd(8)} : *${st.ts}*`
    ])

    const accountBox = infoBox('ACCOUNT', [
        kv('Name', m.pushName || 'No Name'),
        kv('Number', number),
        kv('Status', isOwner ? 'Owner' : 'User')
    ])

    const header = [intro, systemBox, accountBox].join('\n\n')

    const listOf = (list) => list
        .map(({ cat, items }) => [
            `╭─〔 ${cat.toUpperCase()} 〕`,
            ...items.map(c => `│ ${p}${c}`),
            '╰──────────────'
        ].join('\n'))
        .join('\n\n')

    let body
    if (showAll) body = [header, listOf(groups)].join('\n\n')
    else if (category) body = [header, listOf([category])].join('\n\n')
    else {
        const cats = [
            '— *KATEGORI MENU*',
            ...groups.map(g => `-▢ ${p}menu ${g.cat}  (${g.items.length})`),
            `-▢ ${p}menu all  (semua fitur)`
        ].join('\n')
        body = [header, cats].join('\n\n')
    }
    body += `\n\n${global.namebot || 'Bot'}`

    // kirim dengan gambar kalau global.thumb.menu diisi URL, selain itu teks biasa
    const img = global.thumb?.menu
    if (/^https?:\/\//i.test(img || '')) {
        try {
            return await sock.sendMessage(jid, { image: { url: img }, caption: body }, { quoted: m })
        } catch {}
    }
    await sock.sendMessage(jid, { text: body }, { quoted: m })
}

handler.command = ['menu', 'help']
handler.tags = ['main']

export default handler
