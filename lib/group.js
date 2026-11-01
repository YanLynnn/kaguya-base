// Helper grup: cek admin, cari peserta, dan peran bot. Mengerti LID maupun nomor biasa.
import { decodeJid } from './lid.js'

const idsOf = (p) => [p?.id, p?.lid, p?.phoneNumber, p?.jid].filter(Boolean).map(decodeJid)

export async function groupInfo(sock, m) {
    const meta = await sock.groupMetadata(m.chat)
    const participants = meta?.participants || []

    const admins = new Set()
    for (const p of participants) if (p.admin) idsOf(p).forEach(j => admins.add(j))

    const senderIds = [m.sender, m.senderLid, decodeJid(m.key?.participant)].filter(Boolean)
    const botIds = [decodeJid(sock.user?.id), decodeJid(sock.user?.lid)].filter(Boolean)

    return {
        meta,
        participants,
        isAdmin: senderIds.some(j => admins.has(j)),
        isBotAdmin: botIds.some(j => admins.has(j))
    }
}

// jid (nomor atau LID) -> id peserta sesuai format grup (dipakai untuk kick / promote / demote)
export function findParticipant(participants, jid) {
    jid = decodeJid(jid)
    return participants.find(p => idsOf(p).includes(jid)) || null
}
