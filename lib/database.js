// Database JSON sederhana (database.json). Dipakai lewat global.db:
//   db.users[nomor]  = { banned, hit, lastSeen, name }
//   db.groups[jid]   = { welcome, leave, antilink, welcomeText, leaveText }
//   db.owners        = [nomor, ...]   owner tambahan (dari .addowner)
// Perubahan disimpan otomatis (ditunda 2 detik supaya tidak menulis disk terus-menerus).

import fs from 'fs'
import path from 'path'

const file = path.resolve('database.json')
const base = () => ({ users: {}, groups: {}, owners: [] })

let db = base()
try { db = { ...base(), ...JSON.parse(fs.readFileSync(file, 'utf8')) } } catch {}
global.db = db

let timer = null
function writeNow() {
    try {
        fs.writeFileSync(file + '.tmp', JSON.stringify(db))
        fs.renameSync(file + '.tmp', file)
    } catch {}
}

export function saveDb() {
    clearTimeout(timer)
    timer = setTimeout(writeNow, 2000)
}

export function flushDb() {
    clearTimeout(timer)
    writeNow()
}

export function getUser(num) {
    return (db.users[num] ||= { banned: false, hit: 0, lastSeen: 0, name: '' })
}

export function getGroup(jid) {
    return (db.groups[jid] ||= { welcome: false, leave: false, antilink: 'off' })
}

process.on('exit', flushDb)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushDb(); process.exit(0) })

export { db }
