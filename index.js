const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  getContentType
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const { exec } = require('child_process');
const fs = require('fs');

const startTime = Date.now();

async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log('📲 Scan QR code di atas untuk login');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Bot logged out');
      } else {
        console.log('🔄 Reconnecting...');
        connectBot();
      }
    }

    if (connection === 'open') {
      console.log('✅ Bot connected');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const typeMsg = getContentType(msg.message);
    const text =
      msg.message?.conversation ||
      msg.message[typeMsg]?.text ||
      '';

    if (!text.startsWith('?')) return;
    const parts = text.trim().slice(1).split(' ');
    const command = parts[0].toLowerCase();

    try {
      // Kirim presence 'typing'
      await sock.sendPresenceUpdate('composing', from);

      // Tunggu 2 detik
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Hentikan presence 'typing'
      await sock.sendPresenceUpdate('paused', from);
    } catch (e) {
      console.error('❌ Error mengirim presence update:', e);
    }

    switch (command) {
      case 'runtime': {
        const uptime = formatRuntime(Date.now() - startTime);
        await sock.sendMessage(from, { text: `⏱️ Runtime: ${uptime}` });
        break;
      }

      case 's': {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          await sock.sendMessage(from, { text: '❌ Reply gambar untuk dijadikan stiker' });
          return;
        }
        const mediaType = getContentType(quoted);
        if (mediaType !== 'imageMessage') {
          await sock.sendMessage(from, { text: '❌ Hanya bisa convert gambar jadi stiker' });
          return;
        }

        try {
          console.log("📥 Mulai download media...");
          const mediaBuffer = await downloadMediaMessage(
            { message: quoted },
            'buffer',
            {},
            { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
          );
          console.log("✅ Media berhasil diunduh, size:", mediaBuffer.length);

          fs.writeFileSync('input.jpg', mediaBuffer);
          console.log("💾 input.jpg tersimpan.");

          const ffmpegCmd = 'ffmpeg -y -i input.jpg -vf "scale=512:512:force_original_aspect_ratio=decrease" -vcodec libwebp -lossless 1 -qscale 75 -preset default -an -vsync 0 output.webp';
          console.log("⚙️ Jalankan ffmpeg:", ffmpegCmd);

          exec(ffmpegCmd, async (err, stdout, stderr) => {
            if (err) {
              console.error("❌ Error ffmpeg:", err);
              console.error("stderr:", stderr);
              await sock.sendMessage(from, { text: '⚠️ Gagal convert ke WebP (ffmpeg error)' });
              return;
            }

            console.log("✅ ffmpeg selesai.");

            if (!fs.existsSync('output.webp')) {
              console.error("❌ output.webp tidak ditemukan!");
              await sock.sendMessage(from, { text: '⚠️ Tidak ada file output.webp' });
              return;
            }

            const stickerBuffer = fs.readFileSync('output.webp');
            console.log("✅ output.webp terbaca, size:", stickerBuffer.length);

            await sock.sendMessage(from, { sticker: stickerBuffer });
            console.log("📤 Stiker terkirim.");

            fs.unlinkSync('input.jpg');
            fs.unlinkSync('output.webp');
            console.log("🧹 File sementara dihapus.");
          });
        } catch (e) {
          console.error("❌ Error umum saat membuat stiker:", e);
          await sock.sendMessage(from, { text: '⚠️ Terjadi kesalahan saat membuat stiker' });
        }
        break;
      }

      default:
        await sock.sendMessage(from, { text: `❓ Command "${command}" tidak dikenal` });
    }
  });
}

function formatRuntime(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const s = sec % 60;
  return `${h} jam ${m} menit ${s} detik`;
}

connectBot();