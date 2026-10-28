# BaseBot • WhatsApp Bot Base

Base bot WhatsApp berbasis [Baileys](https://github.com/WhiskeySockets/Baileys), simpel, ringan, dan mudah dikembangkan. Gratis dan open source.

> **NOTE:** Base ini masih dalam tahap pengembangan. Jika ada kekurangan atau bug, akan diusahakan diperbaiki pada update selanjutnya.

## ✨ Fitur

- 🔌 Plugin **ESM**, **CommonJS**, dan **TypeScript** (otomatis di-transpile)
- 🧾 Gaya **case** lewat `case.js`
- ⚡ **Hot reload**: edit plugin atau `case.js` tanpa restart bot
- 🧰 **Plugin Manager** dari chat: tambah, edit, ambil, hapus, dan konversi tipe plugin
- 🔐 Login lewat **QR** atau **Pairing Code**
- 🆔 Dukungan **LID**
- 🛡️ **Anti-ban**: jeda acak dan limit pesan keluar per menit
- 🧹 **Optimizer**: pembersihan cache dan RAM otomatis
- 🛠️ Konfigurasi mudah (mode public/owner, multi prefix, dll)

## 📋 Persyaratan

- [Node.js](https://nodejs.org) 18 atau lebih baru
- Git
- Nomor WhatsApp untuk bot

## 🚀 Instalasi

```bash
git clone https://github.com/USERNAME/NAMA-REPO.git
cd NAMA-REPO
npm install
npm start
```

Saat pertama kali jalan, pilih metode login:

1. **Scan QR**
2. **Pairing Code**: masukkan nomor bot, lalu masukkan kode yang muncul di WhatsApp (Perangkat tertaut → Tautkan dengan nomor telepon)

Sesi tersimpan di folder `session/`.

## ⚙️ Konfigurasi

Edit `config.js`, lalu restart bot.

| Variabel | Fungsi |
| --- | --- |
| `global.owners` | Nomor owner (tanpa `+` dan spasi) |
| `global.ownername` | Nama owner |
| `global.nomorbot` | Nomor bot (untuk pairing code) |
| `global.namebot` | Nama bot |
| `global.thumb` | URL gambar menu (kosongkan untuk teks saja) |
| `global.public` | `true` semua orang bisa pakai, `false` owner saja |
| `global.prefix` | Daftar prefix command |
| `global.mess` | Pesan balasan bawaan (owner, group, private) |
| `global.optimizer` | Pengaturan batas RAM, umur pesan, dan antrean per chat |
| `global.antiban` | Pengaturan jeda dan limit pesan keluar |

## 📁 Struktur Folder

```
├── index.js          # Koneksi & login
├── handler.js        # Pemroses pesan
├── config.js         # Konfigurasi bot
├── case.js           # Command gaya case
├── lib/              # Library internal (plugin loader, optimizer, LID, dll)
└── plugins/
    ├── esm/          # Plugin ESM  (.js / .mjs)
    ├── cjs/          # Plugin CommonJS (.cjs)
    └── typescript/   # Plugin TypeScript (.ts)
```

Subfolder di dalam tiap tipe boleh dipakai untuk merapikan plugin.

## 🔌 Membuat Plugin

Tipe plugin ditentukan dari **ekstensi file**.

### ESM (`plugins/esm/halo.js`)

```js
let handler = async (m, { sock, jid, args, prefix, command }) => {
    await sock.sendMessage(jid, { text: 'Halo dunia!' }, { quoted: m })
}

handler.command = ['halo']   // string / RegExp / array
handler.tags = ['example']   // kategori di menu

export default handler
```

### CommonJS (`plugins/cjs/halo.cjs`)

```js
const handler = async (m, { sock, jid }) => {
    await sock.sendMessage(jid, { text: 'Halo dunia!' }, { quoted: m })
}

handler.command = ['halo']
handler.tags = ['example']

module.exports = handler
```

### TypeScript (`plugins/typescript/halo.ts`)

```ts
const handler: any = async (m, { sock, jid }) => {
    await sock.sendMessage(jid, { text: 'Halo dunia!' }, { quoted: m })
}

handler.command = ['halo']
handler.tags = ['example']

export default handler
```

### Opsi Plugin

```js
handler.owner = true       // khusus owner
handler.group = true       // khusus grup
handler.private = true     // khusus private chat
handler.disabled = true    // matikan plugin
handler.hide = ['alias']   // sembunyikan command tertentu dari menu
```

### Gaya Case (`case.js`)

Tambahkan command baru dengan `case 'nama':`. Daftarnya dibaca otomatis untuk routing dan menu, dan file ini di-hot-reload saat disimpan.

```js
case 'halo': {
    await reply('Halo dunia!')
}
break
```

Context yang tersedia: `sock`, `command`, `text`, `args`, `prefix`, `reply`, `isOwner`, `jid`, `sender`, `body`.

## 🧰 Plugin Manager (khusus owner)

Kelola plugin langsung dari WhatsApp:

| Command | Fungsi |
| --- | --- |
| `.addplugin halo.js` + kode | Tambah plugin (bisa juga kirim atau reply file) |
| `.editplugin halo.js` | Lihat atau ubah kode plugin |
| `.getplugin halo` | Ambil file plugin |
| `.convertplugin halo.js cjs` | Konversi tipe plugin (`esm` / `cjs` / `ts`) |
| `.delplugin halo.js` | Hapus plugin |
| `.listplugin` | Daftar plugin |

## 📌 Catatan

- Boleh dipakai dan dimodifikasi, **jangan hapus credit**.
- Dilarang diperjualbelikan.
- Ada bug atau saran? Buka **Issues** di GitHub.
- Jangan upload folder `session/` ke GitHub (sudah ada di `.gitignore`).

## ⭐ Dukungan

Kalau base ini membantu, jangan lupa kasih **Star** ya. Terima kasih! 🙏
