// Contoh plugin CommonJS  ->  plugins/cjs/nama.cjs
// Pakai `require` / `module.exports`. Wajib berekstensi .cjs (project ini "type": "module").
// File lib/*.js bersifat ESM, jadi dari CJS ambil lewat `await import(...)` di dalam handler.
const os = require('os')

const handler = async (m, { sock, jid, prefix, command, args }) => {
    const start = Date.now()
    const { key } = await sock.sendMessage(jid, { text: 'Testing...' }, { quoted: m })
    const ping = Date.now() - start

    // contoh memakai modul ESM dari CJS
    const { pluginStats } = await import('../../lib/plugins.js')
    const st = pluginStats()

    await sock.sendMessage(jid, {
        text: [
            '*PING (CJS)*',
            'Tipe    : CommonJS (plugins/cjs)',
            `Speed   : ${ping} ms`,
            `Plugin  : ESM ${st.esm}, CJS ${st.cjs}, TS ${st.ts}`,
            `Host    : ${os.platform()} ${os.arch()}`,
            args.length ? `Argumen : ${args.join(' ')}` : `Coba: ${prefix}${command} halo dunia`
        ].join('\n'),
        edit: key
    })
}

handler.command = ['pingcjs']
handler.tags = ['example']

module.exports = handler
