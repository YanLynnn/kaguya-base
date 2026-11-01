// Kirim pesan interaktif (native flow): quick reply, list, link, copy.
// Dipakai lewat sock.sendButtons(jid, data, { quoted }) atau m.sendButtons(data).
//
// data = {
//   text,                       // isi pesan
//   footer,                     // teks kecil di bawah (opsional)
//   title,                      // judul di atas isi (opsional)
//   image,                      // URL / Buffer gambar header (opsional)
//   buttons: [
//     { id: '.menu', text: 'Menu' },                         // tombol balas cepat
//     { url: 'https://...', text: 'Buka' },                  // tombol link
//     { copy: 'teks', text: 'Salin' },                       // tombol salin
//     { list: { title: 'Pilih', sections: [                  // tombol daftar pilihan
//         { title: 'Kategori', rows: [{ id: '.menu main', title: 'Main', description: '...' }] }
//     ] } },
//     { name: 'nama_native_flow', params: { ... } }          // mentah
//   ]
// }

import { proto, generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys'

function toNative(b) {
    if (b?.name) return { name: b.name, buttonParamsJson: JSON.stringify(b.params || {}) }
    if (b?.list) {
        return {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: b.list.title || b.text || 'Pilih',
                sections: b.list.sections || []
            })
        }
    }
    if (b?.url) {
        return {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: b.text || 'Buka', url: b.url, merchant_url: b.url })
        }
    }
    if (b?.copy) {
        return {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: b.text || 'Salin', copy_code: String(b.copy) })
        }
    }
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: b?.text || 'Tombol', id: String(b?.id ?? b?.text ?? '') })
    }
}

export async function sendButtons(sock, jid, data = {}, options = {}) {
    const { text = '', footer = '', title = '', image, buttons = [] } = data
    if (!buttons.length) throw new Error('sendButtons: buttons kosong')

    const header = { title: title || '', subtitle: '', hasMediaAttachment: false }
    if (image) {
        const media = await prepareWAMessageMedia(
            { image: Buffer.isBuffer(image) ? image : { url: image } },
            { upload: sock.waUploadToServer }
        )
        header.hasMediaAttachment = true
        header.imageMessage = media.imageMessage
    }

    const q = options.quoted
    const contextInfo = q?.key
        ? {
            stanzaId: q.key.id,
            participant: q.key.participant || q.key.remoteJid,
            quotedMessage: q.message
        }
        : undefined

    const content = {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    header: proto.Message.InteractiveMessage.Header.create(header),
                    body: proto.Message.InteractiveMessage.Body.create({ text }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                    ...(contextInfo ? { contextInfo } : {}),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: buttons.map(toNative),
                        messageParamsJson: ''
                    })
                })
            }
        }
    }

    const msg = generateWAMessageFromContent(jid, content, { userJid: sock.user.id })

    const additionalNodes = [{
        tag: 'biz',
        attrs: {},
        content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
        }]
    }]
    // chat pribadi butuh node bot tambahan supaya tombol tampil
    if (!String(jid).endsWith('@g.us')) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes })
    return msg
}

// ambil id yang dipilih dari balasan tombol (semua jenis). Mengembalikan '' kalau bukan balasan tombol.
export function pickButtonReply(mtype, msg) {
    if (!msg || typeof msg !== 'object') return ''
    switch (mtype) {
        case 'interactiveResponseMessage': {
            const raw = msg.nativeFlowResponseMessage?.paramsJson
            if (!raw) return msg.body?.text || ''
            try {
                const p = JSON.parse(raw)
                return String(p.id ?? p.selectedId ?? p.row_id ?? '')
            } catch { return '' }
        }
        case 'buttonsResponseMessage': return msg.selectedButtonId || ''
        case 'listResponseMessage': return msg.singleSelectReply?.selectedRowId || ''
        case 'templateButtonReplyMessage': return msg.selectedId || ''
        default: return ''
    }
}
