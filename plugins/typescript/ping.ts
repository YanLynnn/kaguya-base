// Contoh plugin TypeScript  ->  plugins/typescript/nama.ts
// Di-transpile otomatis saat dimuat (butuh paket "typescript", sudah ada di package.json).
// Tipe hanya dicek di editor; saat runtime cukup dihapus (tanpa type-check).
import os from 'os'

const handler: any = async (m, { sock, jid, prefix, command, args }) => {
    const start: number = Date.now()
    const { key } = await sock.sendMessage(jid, { text: 'Testing...' }, { quoted: m })
    const ping: number = Date.now() - start

    await sock.sendMessage(jid, {
        text: [
            '*PING (TypeScript)*',
            'Tipe    : TypeScript (plugins/typescript)',
            `Speed   : ${ping} ms`,
            `Node    : ${process.version}`,
            `Host    : ${os.platform()} ${os.arch()}`,
            args.length ? `Argumen : ${args.join(' ')}` : `Coba: ${prefix}${command} halo dunia`
        ].join('\n'),
        edit: key
    })
}

handler.command = ['pingts']
handler.tags = ['example']

export default handler
