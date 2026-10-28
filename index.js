import './config.js'

import chalk from 'chalk'
import pino from 'pino'
import readline from 'readline'
import qrcodeTerminal from 'qrcode-terminal'
import { Boom } from '@hapi/boom'
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} from '@whiskeysockets/baileys'
import { serialize } from './lib/serialize.js'
import { decodeJid, watchLidEvents } from './lib/lid.js'
import {
    opt, startOptimizer, createFloodGuard, createSendQueue, backoffDelay,
    rememberMessage, recallMessage, TTLCache, registerCleaner
} from './lib/optimizer.js'

process.on('uncaughtException', console.error)
process.on('unhandledRejection', (r) => console.log(chalk.red('[ UNHANDLED ]'), r?.message || r))

const SESSION_DIR = 'session'
const logger = pino({ level: 'silent' })

startOptimizer()

const msgRetryCounterCache = new TTLCache({ max: 2000, ttl: 10 * 60_000 })
const groupCache = new TTLCache({ max: 300, ttl: 5 * 60_000 })
registerCleaner('msgRetryCounterCache', (lv) => lv === 'hard' ? msgRetryCounterCache.flushAll() : msgRetryCounterCache.prune())
registerCleaner('groupCache', (lv) => lv === 'hard' ? groupCache.flushAll() : groupCache.prune())

const toSec = (t) => (typeof t === 'number' ? t : t?.toNumber ? t.toNumber() : Number(t) || 0)
const onFlood = createFloodGuard()

let pairingAsked = false
let attempts = 0
let current = null

const ask = (q) => new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); resolve(a.trim()) })
})

function closeSocket(sock) {
    if (!sock) return
    for (const ev of ['connection.update', 'messages.upsert', 'creds.update', 'groups.update', 'group-participants.update']) {
        try { sock.ev.removeAllListeners(ev) } catch {}
    }
    try { sock.end(undefined) } catch {}
}

async function start() {
    closeSocket(current)

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
    let version
    try { ({ version } = await fetchLatestBaileysVersion()) } catch {}

    const sock = makeWASocket({
        ...(version ? { version } : {}),
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
        keepAliveIntervalMs: 25_000,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 2,
        msgRetryCounterCache,
        // metadata grup dari cache lokal -> kirim ke grup tidak menunggu query ke server
        cachedGroupMetadata: async (jid) => groupCache.get(jid),
        getMessage: async (key) => recallMessage(key?.id)
    })
    current = sock
    global.sock = sock
    sock.decodeJid = decodeJid

    // ───────── kirim pesan: antrean anti-ban + catat id pesan bot ─────────
    global.botSentIds = global.botSentIds || new Set()
    const track = (id) => {
        if (!id) return
        global.botSentIds.add(id)
        if (global.botSentIds.size > 1000) global.botSentIds.delete(global.botSentIds.values().next().value)
    }
    const rawSend = sock.sendMessage.bind(sock)
    const enqueue = createSendQueue()
    const selfJid = () => decodeJid(sock.user?.id)
    sock.sendMessage = async (jid, content, options) => {
        const light = jid === selfJid() || jid === 'status@broadcast' || !!(content && (content.edit || content.delete || content.react))
        const sent = await enqueue(jid, () => rawSend(jid, content, options), { skip: light })
        track(sent?.key?.id)
        rememberMessage(sent?.key?.id, sent?.message)
        return sent
    }

    // metadata grup: cache + hapus saat ada perubahan
    const rawMeta = sock.groupMetadata.bind(sock)
    sock.groupMetadata = async (jid) => {
        const hit = groupCache.get(jid)
        if (hit) return hit
        const md = await rawMeta(jid)
        groupCache.set(jid, md)
        return md
    }
    sock.ev.on('groups.update', (list) => { for (const g of list || []) groupCache.del(g.id) })
    sock.ev.on('group-participants.update', ({ id }) => groupCache.del(id))

    watchLidEvents(sock)
    sock.ev.on('creds.update', saveCreds)

    // belum login: pilih QR atau pairing code
    let useQr = true
    if (!sock.authState.creds.registered && !pairingAsked) {
        pairingAsked = true
        const choice = await ask('Pilih metode login:\n1. Scan QR\n2. Pairing code\n> ')
        if (choice === '2') {
            useQr = false
            const number = String(global.nomorbot || '').replace(/\D/g, '') || await ask('Nomor bot (628xxx): ')
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(number)
                    console.log(chalk.yellowBright(`Pairing code: ${code?.match(/.{1,4}/g)?.join('-') || code}`))
                } catch (e) {
                    console.log(chalk.red(`Gagal meminta pairing code: ${e.message}`))
                }
            }, 3000)
        }
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr && useQr) qrcodeTerminal.generate(qr, { small: true })

        if (connection === 'open') {
            attempts = 0
            console.log(chalk.greenBright(`[ OK ] ${global.namebot} tersambung sebagai ${decodeJid(sock.user.id)}`))
        }
        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (code === DisconnectReason.loggedOut) {
                console.log(chalk.red('[ ! ] Sesi logout. Hapus folder session lalu jalankan ulang.'))
                process.exit(1)
            }
            // restartRequired muncul setelah scan/pairing: sambung ulang langsung
            const delay = code === DisconnectReason.restartRequired ? 500 : backoffDelay(attempts++)
            console.log(chalk.yellow(`[ ! ] Koneksi terputus (${code ?? 'unknown'}), menyambung ulang dalam ${(delay / 1000).toFixed(1)}s...`))
            setTimeout(() => start().catch(e => console.log(chalk.red(e.message))), delay)
        }
    })

    // ───────── pesan masuk: tiap chat diproses paralel, pesan lama dibuang ─────────
    const { handler } = await import('./handler.js')
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return
        const now = Date.now()
        const maxAge = opt().maxMsgAgeSec
        for (const raw of messages) {
            if (!raw?.message || !raw.key) continue
            const ts = toSec(raw.messageTimestamp)
            if (maxAge && ts && now / 1000 - ts > maxAge) continue
            raw.receivedAt = now
            onFlood(raw.key.remoteJid || 'unknown', async () => handler(sock, await serialize(sock, raw)))
        }
    })
}

start()
