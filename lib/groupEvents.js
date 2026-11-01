// Pesan otomatis saat ada anggota masuk / keluar grup (diatur dengan .welcome dan .leave)
import chalk from 'chalk'

export const DEFAULT_WELCOME = 'Selamat datang @user di *@group*! 👋'
export const DEFAULT_LEAVE = 'Sampai jumpa @user, selamat tinggal dari *@group*.'

export function watchGroupEvents(sock) {
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            if (action !== 'add' && action !== 'remove') return
            const g = global.db?.groups?.[id]
            if (!g) return
            const enabled = action === 'add' ? g.welcome : g.leave
            if (!enabled) return

            const ids = (participants || []).map(p => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
            if (!ids.length) return

            const meta = await sock.groupMetadata(id).catch(() => null)
            const template = (action === 'add' ? g.welcomeText : g.leaveText) || (action === 'add' ? DEFAULT_WELCOME : DEFAULT_LEAVE)

            const users = ids.map(j => `@${j.split('@')[0]}`).join(' ')
            const text = template.replace(/@user/gi, users).replace(/@group/gi, meta?.subject || 'grup ini')
            await sock.sendMessage(id, { text, mentions: ids })
        } catch (e) {
            console.log(chalk.red(`[ GROUP ] ${e.message}`))
        }
    })
}
