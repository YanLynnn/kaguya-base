import os from 'os'
import v8 from 'v8'
import vm from 'vm'
import chalk from 'chalk'
import { monitorEventLoopDelay } from 'perf_hooks'

// Pengaturan lewat config.js: global.optimizer dan global.antiban
const OPT_DEFAULTS = {
    memSoftRatio: 0.70,
    memHardRatio: 0.85,
    rssHardRatio: 0.65,
    memIntervalMs: 60_000,
    lagWarnMs: 800,
    maxMsgAgeSec: 60,
    maxPendingPerChat: 3,
    quiet: false
}
const AB_DEFAULTS = { minDelayMs: 1200, maxDelayMs: 3200, perMinute: 20, perChatPerMinute: 10 }

export const opt = () => ({ ...OPT_DEFAULTS, ...(global.optimizer || {}) })
export const antiban = () => ({ ...AB_DEFAULTS, ...(global.antiban || {}) })

const log = (color, tag, msg) => { if (!opt().quiet) console.log(color(`[ ${tag} ] ${msg}`)) }
const mb = (n) => `${(n / 1024 / 1024).toFixed(0)}MB`
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ───────── TTL cache kecil (kompatibel dengan interface cache Baileys) ─────────
export class TTLCache {
    constructor({ max = 500, ttl = 5 * 60_000 } = {}) {
        this.max = max
        this.ttl = ttl
        this.map = new Map()
    }
    get(key) {
        const hit = this.map.get(key)
        if (!hit) return undefined
        if (hit.exp < Date.now()) { this.map.delete(key); return undefined }
        return hit.value
    }
    set(key, value) {
        this.map.delete(key)
        this.map.set(key, { value, exp: Date.now() + this.ttl })
        if (this.map.size > this.max) this.map.delete(this.map.keys().next().value)
        return true
    }
    del(key) { return this.map.delete(key) }
    has(key) { return this.get(key) !== undefined }
    flushAll() { this.map.clear() }
    prune() {
        const now = Date.now()
        for (const [k, v] of this.map) if (v.exp < now) this.map.delete(k)
    }
    get size() { return this.map.size }
}

// ───────── registry pembersih cache ─────────
const cleaners = new Map()
export function registerCleaner(name, fn, level = 'soft') { cleaners.set(name, { fn, level }) }

export function runCleaners(level = 'soft') {
    for (const [name, { fn, level: lv }] of cleaners) {
        if (level === 'soft' && lv === 'hard') continue
        try { fn(level) } catch (e) { log(chalk.yellow, 'OPTIMIZER', `cleaner ${name} gagal: ${e.message}`) }
    }
}

function enableGc() {
    if (typeof global.gc === 'function') return true
    try {
        v8.setFlagsFromString('--expose-gc')
        global.gc = vm.runInNewContext('gc')
        return true
    } catch {
        return false
    }
}
const collectGarbage = () => { try { global.gc?.() } catch {} }

// ───────── penyimpan pesan terkirim (untuk retry / dekripsi ulang) ─────────
const sentStore = new TTLCache({ max: 400, ttl: 15 * 60_000 })
export const rememberMessage = (id, message) => { if (id && message) sentStore.set(id, message) }
export const recallMessage = (id) => sentStore.get(id)
registerCleaner('sentStore', (level) => level === 'hard' ? sentStore.flushAll() : sentStore.prune())

// ───────── pemantau RAM + event loop ─────────
let started = false
export function startOptimizer() {
    if (started) return
    started = true

    const gcOk = enableGc()
    const heapLimit = v8.getHeapStatistics().heap_size_limit
    const totalRam = os.totalmem()

    let tick = 0
    const mem = setInterval(() => {
        tick++
        const c = opt()
        const { heapUsed, rss } = process.memoryUsage()
        const heapRatio = heapUsed / heapLimit
        const rssRatio = rss / totalRam

        if (heapRatio > c.memHardRatio || rssRatio > c.rssHardRatio) {
            runCleaners('hard')
            collectGarbage()
            log(chalk.yellow, 'RAM', `tinggi (heap ${mb(heapUsed)}, rss ${mb(rss)}) -> cache dibersihkan`)
        } else if (heapRatio > c.memSoftRatio) {
            runCleaners('soft')
            collectGarbage()
            log(chalk.yellow, 'RAM', `heap ${mb(heapUsed)} -> pembersihan ringan`)
        } else if (tick % 10 === 0) {
            runCleaners('soft')
            collectGarbage()
        }
    }, OPT_DEFAULTS.memIntervalMs)
    mem.unref()

    // event loop macet = penyebab utama bot "delay"
    const histogram = monitorEventLoopDelay({ resolution: 20 })
    histogram.enable()
    let lastWarn = 0
    const lag = setInterval(() => {
        const p99 = histogram.percentile(99) / 1e6
        histogram.reset()
        if (p99 > opt().lagWarnMs && Date.now() - lastWarn > 5 * 60_000) {
            lastWarn = Date.now()
            log(chalk.yellow, 'LAG', `event loop lambat (p99 ${p99.toFixed(0)}ms)`)
            runCleaners('soft')
        }
    }, 30_000)
    lag.unref()

    log(chalk.greenBright, 'OPTIMIZER', `aktif (heap limit ${mb(heapLimit)}, gc ${gcOk ? 'ya' : 'tidak'})`)
}

// ───────── penjaga flood per chat (tetap paralel, tidak saling menunggu) ─────────
export function createFloodGuard() {
    const inflight = new Map()
    return async (key, task) => {
        const n = inflight.get(key) || 0
        if (n >= opt().maxPendingPerChat) return
        inflight.set(key, n + 1)
        try {
            await task()
        } catch (e) {
            console.log(chalk.red(`[ ERROR ] ${String(key).slice(0, 24)}: ${e?.message || e}`))
        } finally {
            const left = (inflight.get(key) || 1) - 1
            if (left <= 0) inflight.delete(key)
            else inflight.set(key, left)
        }
    }
}

// ───────── antrean kirim pesan (anti-ban) ─────────
// Pesan pertama setelah sepi langsung terkirim; jeda acak hanya dipakai kalau pesan keluar
// beruntun. Edit / react / hapus / pesan ke diri sendiri tidak ditahan (skip).
export function createSendQueue() {
    let tail = Promise.resolve()
    let lastSent = 0
    const globalLog = []
    const chatLog = new Map()
    const prune = (arr, now) => { while (arr.length && now - arr[0] > 60_000) arr.shift() }

    async function waitTurn(jid) {
        const c = antiban()
        const gap = c.minDelayMs + Math.random() * Math.max(0, c.maxDelayMs - c.minDelayMs)
        const sinceLast = Date.now() - lastSent
        if (sinceLast < gap) await sleep(gap - sinceLast)

        for (;;) {
            const now = Date.now()
            prune(globalLog, now)
            const cl = chatLog.get(jid) || []
            prune(cl, now)
            chatLog.set(jid, cl)
            if (globalLog.length < c.perMinute && cl.length < c.perChatPerMinute) break
            const oldest = Math.min(
                globalLog.length >= c.perMinute ? globalLog[0] : Infinity,
                cl.length >= c.perChatPerMinute ? cl[0] : Infinity
            )
            await sleep(Math.max(500, 60_000 - (now - oldest)) + Math.random() * 1000)
        }
        const t = Date.now()
        lastSent = t
        globalLog.push(t)
        chatLog.get(jid).push(t)
        if (chatLog.size > 200) chatLog.delete(chatLog.keys().next().value)
    }

    return (jid, fn, { skip = false } = {}) => {
        if (skip) return fn()
        const run = tail.then(() => waitTurn(jid)).then(fn)
        tail = run.catch(() => {})
        return run
    }
}

// jeda reconnect eksponensial: 5s, 10s, 20s ... maksimal 5 menit (+ jitter)
export function backoffDelay(attempt) {
    const base = Math.min(5 * 60_000, 5000 * 2 ** Math.min(attempt, 6))
    return base + Math.floor(Math.random() * 3000)
}
