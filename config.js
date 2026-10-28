// Konfigurasi dasar bot. Simpan file ini, restart bot untuk menerapkan.

global.owners = ['']      // nomor owner (tanpa +, tanpa spasi)
global.ownername = 'YannRzy'
global.nomorbot = ''      // nomor bot (dipakai untuk pairing code)
global.namebot = 'kaguya base'

global.thumb = { menu: 'https://cdn.zass.in/yERRcGpCb2.jpg' }              // URL gambar menu (kosong = teks saja)

global.public = true                  // true = semua orang bisa pakai | false = owner saja
global.prefix = ['', '.', '!', ',']

global.mess = {
    owner: 'Khusus owner.',
    group: 'Fitur ini hanya bisa dipakai di grup.',
    private: 'Fitur ini hanya bisa dipakai di private chat.'
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
