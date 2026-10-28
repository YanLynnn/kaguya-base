// Auto convert LID -> JID (nomor asli). WhatsApp baru memakai LID (xxx@lid) sebagai identitas
// pengirim; di sini semuanya dikembalikan ke xxx@s.whatsapp.net supaya owner / mention / database
// tetap memakai nomor.

export const decodeJid = (jid) => (jid ? String(jid).replace(/:\d+@/, '@') : jid)
export const isLid = (jid) => String(jid || '').endsWith('@lid')

const lidToPn = new Map() // "123@lid" -> "628xxx@s.whatsapp.net"
const MAX = 5000

// simpan pasangan LID <-> nomor yang sudah diketahui
export function learn(a, b) {
    a = decodeJid(a); b = decodeJid(b)
    if (!a || !b) return
    const lid = isLid(a) ? a : isLid(b) ? b : null
    const pn = lid === a ? b : a
    if (!lid || isLid(pn) || !pn.endsWith('@s.whatsapp.net')) return
    lidToPn.set(lid, pn)
    if (lidToPn.size > MAX) lidToPn.delete(lidToPn.keys().next().value)
}

// versi cepat tanpa await: dari cache saja
export const cachedPN = (jid) => {
    jid = decodeJid(jid)
    return isLid(jid) ? lidToPn.get(jid) || null : jid
}

// LID -> nomor. Kalau bukan LID, dikembalikan apa adanya. Kalau gagal, LID asli dikembalikan.
export async function toPN(sock, jid, groupJid) {
    jid = decodeJid(jid)
    if (!isLid(jid)) return jid

    const hit = lidToPn.get(jid)
    if (hit) return hit

    try {
        const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid)
        if (pn) { learn(jid, pn); const r = lidToPn.get(jid); if (r) return r }
    } catch {}

    // terakhir: cari di daftar anggota grup (Baileys 7 menyertakan phoneNumber)
    if (groupJid?.endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(groupJid)
            for (const p of meta?.participants || []) {
                const pid = decodeJid(p.id || p.lid)
                const pn = decodeJid(p.phoneNumber || p.jid)
                if (isLid(pid) && pn) learn(pid, pn)
            }
            return lidToPn.get(jid) || jid
        } catch {}
    }
    return jid
}

// nomor -> LID (kebalikannya), untuk perbandingan identitas
export async function toLID(sock, jid) {
    jid = decodeJid(jid)
    if (isLid(jid)) return jid
    try {
        const lid = await sock?.signalRepository?.lidMapping?.getLIDForPN?.(jid)
        if (lid) { learn(lid, jid); return decodeJid(lid) }
    } catch {}
    return jid
}

// pasang pembaruan pemetaan dari event Baileys
export function watchLidEvents(sock) {
    sock.ev.on('lid-mapping.update', (u) => {
        for (const x of [].concat(u || [])) learn(x?.lid, x?.pn)
    })
    sock.ev.on('contacts.upsert', (list) => {
        for (const c of list || []) if (c?.id && c?.lid) learn(c.id, c.lid)
    })
}
