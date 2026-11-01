// Konfigurasi dasar bot. Simpan file ini, restart bot untuk menerapkan.

global.owners = ['']      // nomor owner (tanpa +, tanpa spasi)
global.ownername = 'YannRzy'
global.nomorbot = ''      // nomor bot (dipakai untuk pairing code)
global.namebot = 'kaguya base'

global.thumb = { menu: 'https://cdn.zass.in/yERRcGpCb2.jpg' }              // URL gambar menu (kosong = teks saja)

global.public = true                  // mode awal. true = public | false = self (bisa diganti dari chat: .public / .self)
global.prefix = ['', '.', '!', ',']

global.mess = {
    owner: 'Khusus owner.',
    group: 'Fitur ini hanya bisa dipakai di grup.',
    private: 'Fitur ini hanya bisa dipakai di private chat.',
    admin: 'Fitur ini khusus admin grup.',
    botAdmin: 'Jadikan bot admin grup dulu supaya fitur ini bisa dipakai.'
}

global.cooldown = 3           // jeda antar command per user (detik). Per plugin: handler.cooldown = 10. Owner dilewati
global.errorlog = true        // true = detail error command dikirim ke chat owner
global.restartMode = 'auto'   // .restart -> 'auto' | 'exit' (biarkan pm2/panel yang menyalakan ulang) | 'spawn' (bot menyalakan dirinya sendiri)

global.api = {
    tiktok: 'https://www.tikwm.com/api/'   // dipakai .tiktok (layanan pihak ketiga, bisa berubah / mati)
}

global.optimizer = {
    maxMsgAgeSec: 60,          // pesan lebih lama dilewati
    maxPendingPerChat: 3,      // maks proses bersamaan per chat
    memSoftRatio: 0.70,        // heap > 70% → bersihkan cache ringan
    memHardRatio: 0.85,        // heap > 85% → bersihkan semua cache
    rssHardRatio: 0.65,        // RAM server > 65% → bersihkan semua cache
    quiet: false               // true = sembunyikan log RAM
}

global.antiban = {
    minDelayMs: 1200,          // jeda minimum antar pesan
    maxDelayMs: 3200,          // jeda maksimum (acak)
    perMinute: 20,             // maks pesan keluar / menit
    perChatPerMinute: 10       // maks pesan keluar / menit per chat
}
