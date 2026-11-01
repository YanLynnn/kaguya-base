// Kelola anggota: .kick .promote .demote  (admin grup + bot harus admin)
import { findParticipant } from '../lib/group.js'
import { getTarget, numberOf } from '../lib/util.js'

const ACTION = { kick: 'remove', promote: 'promote', demote: 'demote' }
const DONE = { kick: 'dikeluarkan', promote: 'dijadikan admin', demote: 'diturunkan dari admin' }

let handler = async (m, { sock, command, text, prefix, participants, isOwner }) => {
    const target = getTarget(m, text)
    if (!target) return m.reply(`Tag, reply, atau tulis nomornya.\nContoh: ${prefix || '.'}${command} @user`)

    const part = findParticipant(participants, target)
    if (!part) return m.reply('Orang itu tidak ada di grup ini.')

    const num = numberOf(target)
    const owners = [].concat(global.owners || [], global.db?.owners || []).map(numberOf)
    if (command === 'kick') {
        if (owners.includes(num)) return m.reply('Tidak bisa mengeluarkan owner bot.')
        if (findParticipant(participants, sock.user?.id)?.id === part.id) return m.reply('Tidak bisa mengeluarkan bot sendiri.')
    }

    await sock.groupParticipantsUpdate(m.chat, [part.id], ACTION[command])
    await m.reply(`@${part.id.split('@')[0]} berhasil ${DONE[command]}.`, { mentions: [part.id] })
}

handler.command = ['kick', 'promote', 'demote']
handler.tags = ['group']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
