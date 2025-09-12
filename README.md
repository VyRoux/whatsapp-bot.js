# whatsapp-bot.js

Bot WhatsApp sederhana menggunakan Node.js dan Baileys.

## Library yang digunakan
- **@whiskeysockets/baileys**: Library utama untuk koneksi WhatsApp Web
- **@hapi/boom**: Untuk handling error
- **qrcode-terminal**: Menampilkan QR code di terminal
- **sharp**: Proses gambar untuk fitur stiker

> Catatan: Library `baileys` adalah duplikat, bisa dihapus jika tidak digunakan.

## Fitur
- Hanya admin dan grup tertentu yang bisa akses bot
- QR code otomatis diregenerate setiap 1 menit jika belum login
- Fitur stiker dari gambar reply
- Command runtime, help, dan validasi akses

## Cara install
1. Clone repo ini
2. Jalankan `yarn install` atau `npm install`
3. Jalankan bot dengan `node index.js`

## Konfigurasi
- Tambahkan nomor admin dan ID grup di `config.js`
- Jangan upload folder `auth/` dan `node_modules/` ke GitHub

## Kontribusi
Silakan pull request atau issue jika ingin menambah fitur.
