// Contoh plugin ESM  ->  plugins/esm/nama.js
// Pakai `import` / `export default`. Bisa import lib bot langsung.
import os from 'os'

let handler = async (m, { sock, jid, prefix, command, args }) => {
    const start = Date.now()
    const { key } = await sock.sendMessage(jid, { text: 'Testing...' }, { quoted: m })
    const ping = Date.now() - start

    await sock.sendMessage(jid, {
        text: [
            '*PING (ESM)*',
            `Tipe    : ESM (plugins/esm)`,
            `Speed   : ${ping} ms`,
            `Runtime : ${Math.floor(process.uptime())} detik`,
            `Node    : ${process.version}`,
            `Host    : ${os.platform()} ${os.arch()}`,
            args.length ? `Argumen : ${args.join(' ')}` : `Coba: ${prefix}${command} halo dunia`
        ].join('\n'),
        edit: key
    })
}

handler.command = ['pingesm']       // string / RegExp / array
handler.tags = ['example']          // kategori di menu
// handler.owner = true             // khusus owner
// handler.group = true             // khusus grup
// handler.private = true           // khusus private chat
// handler.disabled = true          // matikan plugin
// handler.hide = ['alias']         // sembunyikan command tertentu dari menu

export default handler
