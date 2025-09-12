const {
      makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      downloadMediaMessage,
      getContentType
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const sharp = require('sharp');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

const startTime = Date.now();
// Import config admin dan grup
const { admins, allowedGroups } = require('./config');

async function connectBot() {
      const { state, saveCreds } = await useMultiFileAuthState('auth');
      const sock = makeWASocket({ auth: state });

      sock.ev.on('creds.update', saveCreds);

      let qrCodeData = null;
      let qrInterval = null;
      sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Tampilkan QR di terminal dan simpan data QR
            if (qr) {
                  qrCodeData = qr;
                  qrcode.generate(qr, { small: true });
                  console.log('📲 Scan QR code di atas untuk login');
                  // Mulai interval regenerate QR setiap 1 menit
                  if (!qrInterval) {
                        qrInterval = setInterval(() => {
                              if (qrCodeData) {
                                    console.clear();
                                    qrcode.generate(qrCodeData, { small: true });
                                    console.log('📲 QR code di atas diregenerate, silakan scan ulang');
                              }
                        }, 60000); // 1 menit
                  }
            }

            // Koneksi putus
            if (connection === 'close') {
                  const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                  if (reason === DisconnectReason.loggedOut) {
                        console.log('❌ Bot logged out');
                  } else {
                        console.log('🔄 Reconnecting...');
                        connectBot();
                  }
            }

            // Koneksi sukses
            if (connection === 'open') {
                  console.log('✅ Bot connected');
                  console.log('🚀 Bot sudah nyala dan siap menerima pesan!');
                  // Hentikan interval regenerate QR jika sudah login
                  if (qrInterval) {
                        clearInterval(qrInterval);
                        qrInterval = null;
                        qrCodeData = null;
                  }
            }
      });

      // Pesan masuk
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            console.log('📩 Bot menerima pesan baru');
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            // Log ID grup setiap ada pesan dari grup
            if (isGroup) {
                  console.log('ID Grup:', from);
            }
            const typeMsg = getContentType(msg.message);
            const text = msg.message?.conversation || msg.message[typeMsg]?.text || '';

            // Validasi akses admin dan grup
            if (isGroup) {
                  // Hanya grup yang diizinkan
                  if (!allowedGroups.includes(from)) {
                        await sock.sendMessage(from, { text: '❌ Bot tidak diizinkan di grup ini.' }, { quoted: msg });
                        return;
                  }
            } else {
                  // Hanya admin yang bisa akses di chat pribadi
                  if (!admins.includes(sender.replace(/[^0-9]/g, ''))) {
                        await sock.sendMessage(from, { text: '❌ Kamu tidak punya akses ke bot ini.' }, { quoted: msg });
                        return;
                  }
            }

            // Cek prefix ?
            if (!text.startsWith('?')) return;
            const command = text.trim().slice(1).split(' ')[0].toLowerCase();

            switch (command) {
                  case 'runtime':
                        const uptime = formatRuntime(Date.now() - startTime);
                        await sock.sendMessage(from, { text: `⏱️ Runtime: ${uptime}` }, { quoted: msg });
                        break;

                  case 's':
                        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                        if (!quoted) {
                              return sock.sendMessage(from, { text: '❌ Reply ke gambar dengan ?s untuk buat stiker.' }, { quoted: msg });
                        }

                        const mediaType = getContentType(quoted);
                        if (mediaType !== 'imageMessage') {
                              return sock.sendMessage(from, { text: '❌ Yang direply bukan gambar.' }, { quoted: msg });
                        }

                        try {
                              const mediaBuffer = await downloadMediaMessage(
                                    { message: quoted },
                                    'buffer',
                                    {},
                                    { logger: sock.logger, reuploadRequest: sock.reuploadRequest }
                              );

                              const stickerBuffer = await sharp(mediaBuffer)
                                    .resize(512, 512, { fit: 'contain' })
                                    .webp()
                                    .toBuffer();

                              await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
                        } catch (e) {
                              console.error('❌ Gagal convert jadi stiker:', e);
                              await sock.sendMessage(from, { text: '❌ Gagal membuat stiker.' }, { quoted: msg });
                        }
                        break;

                  default:
                        await sock.sendMessage(from, { text: `❓ Command tidak dikenal: ${command}` }, { quoted: msg });
            }
      });
}

// Format waktu runtime
function formatRuntime(ms) {
      const sec = Math.floor(ms / 1000);
      const m = Math.floor(sec / 60) % 60;
      const h = Math.floor(sec / 3600);
      const s = sec % 60;
      return `${h} jam ${m} menit ${s} detik`;
}

connectBot();
