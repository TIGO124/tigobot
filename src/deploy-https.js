// Undici/IPv6-DNS sorunu olan ağlarda çalışan alternatif deploy betiği.
// Node'un yerleşik https modülünü kullanır (dns.lookup ile çalışır).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) commands.push(cmd.data.toJSON());
}

function put(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'discord.com',
      path: pathname,
      method: 'PUT',
      headers: {
        Authorization: `Bot ${process.env.TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'TigoBot-deploy (node-https)',
      },
      timeout: 20000,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw);
        else reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('HTTPS timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    if (!process.env.TOKEN || !process.env.CLIENT_ID) throw new Error('.env içinde TOKEN/CLIENT_ID eksik');
    console.log(`${commands.length} komut kaydediliyor (https)...`);
    // GUILD_IDS virgülle ayrılmış birden çok sunucu alabilir (anında). Yoksa globale düşer.
    const guildIds = (process.env.GUILD_IDS || process.env.GUILD_ID || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (guildIds.length) {
      for (const gid of guildIds) {
        await put(`/api/v10/applications/${process.env.CLIENT_ID}/guilds/${gid}/commands`, commands);
        console.log(`Sunucuya kaydedildi (anında): ${gid}`);
      }
    } else {
      await put(`/api/v10/applications/${process.env.CLIENT_ID}/commands`, commands);
      console.log('Global kaydedildi (1 saate kadar yayılır). Anında görmek için .env içine GUILD_ID ekle.');
    }
  } catch (e) {
    console.error('Deploy hatası:', e.message);
    process.exitCode = 1;
  }
})();
