import { downloadContentFromMessage, getContentType } from '@whiskeysockets/baileys'
import { decodeJid, isLid, learn, cachedPN, toPN } from './lid.js'

export { decodeJid }

const WRAPPERS = ['documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage']

function unwrap(message) {
    if (!message) return {}
    let mtype = getContentType(message)
    let depth = 0
    while (mtype && WRAPPERS.includes(mtype) && depth++ < 5) {
        message = message[mtype]?.message
        mtype = message ? getContentType(message) : undefined
    }
    return { mtype, msg: mtype ? message[mtype] : undefined }
}

async function download(node, mtype) {
    let type = String(mtype || '').replace(/Message$/, '').toLowerCase()
    if (!['image', 'video', 'audio', 'sticker'].includes(type)) type = 'document'
    const stream = await downloadContentFromMessage(node, type)
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}

// pengirim -> nomor. Jalur cepat: field *Alt dari pesan / cache, tanpa await.
function senderFast(sock, m) {
    const k = m.key
    const raw = decodeJid(m.fromMe ? sock.user.id : (k.participant || k.remoteJid))
    if (!isLid(raw)) return { raw, pn: raw }

    const alt = decodeJid(m.isGroup ? k.participantAlt : k.remoteJidAlt)
    if (alt && !isLid(alt)) { learn(raw, alt); return { raw, pn: alt } }
    return { raw, pn: cachedPN(raw) }
}

// ubah pesan mentah Baileys jadi objek m (body, sender, reply, quoted, download)
export async function serialize(sock, m) {
    if (!m?.key) return m

    m.id = m.key.id
    m.isBaileys = m.id?.startsWith('BAE5') && m.id.length === 16
    m.chat = m.key.remoteJid // dibiarkan apa adanya supaya balasan tetap terkirim
    m.fromMe = m.key.fromMe
    m.isGroup = m.chat?.endsWith('@g.us')
    m.pushName = m.pushName || 'Unknown'

    const s = senderFast(sock, m)
    m.senderLid = isLid(s.raw) ? s.raw : null
    m.sender = s.pn || await toPN(sock, s.raw, m.isGroup ? m.chat : undefined)

    if (!m.message) return m

    const { mtype, msg } = unwrap(m.message)
    m.mtype = mtype
    m.msg = msg

    const ctx = msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo || null

    // mention: LID -> nomor
    const mentioned = ctx?.mentionedJid || []
    m.mentionedJid = mentioned.some(isLid)
        ? await Promise.all(mentioned.map(j => toPN(sock, j, m.isGroup ? m.chat : undefined)))
        : mentioned.map(decodeJid)

    if (ctx?.quotedMessage) {
        const q = unwrap(ctx.quotedMessage)
        const qmsg = typeof q.msg === 'string' ? { text: q.msg } : (q.msg || {})
        const qSender = await toPN(sock, ctx.participant, m.isGroup ? m.chat : undefined)
        const me = [decodeJid(sock.user?.id), decodeJid(sock.user?.lid)].filter(Boolean)
        m.quoted = {
            ...qmsg,
            mtype: q.mtype,
            id: ctx.stanzaId,
            chat: ctx.remoteJid || m.chat,
            sender: qSender,
            fromMe: me.includes(decodeJid(ctx.participant)) || me.includes(qSender),
            text: qmsg.text || qmsg.caption || qmsg.conversation || '',
            isMedia: !!qmsg.mimetype,
            download: () => download(qmsg, q.mtype)
        }
    } else {
        m.quoted = null
    }

    m.body = m.message.conversation || msg?.text || msg?.caption || ''
    m.text = m.body
    m.isMedia = !!msg?.mimetype
    m.download = m.isMedia ? () => download(msg, mtype) : null

    m.reply = (text, options = {}) => {
        if (Buffer.isBuffer(text)) return sock.sendMessage(m.chat, { document: text, ...options }, { quoted: m })
        return sock.sendMessage(m.chat, { text, ...options }, { quoted: m })
    }

    return m
}
