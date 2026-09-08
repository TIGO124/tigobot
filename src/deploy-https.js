// Manuel komut kaydı (yerel ağdaki undici sorunu için https kullanır).
// GUILD_IDS virgülle ayrılmış sunucular; GUILD_LANGS "id:dil" eşleşmeleri (yoksa tr).
// Örnek: GUILD_LANGS=123:tr,456:en
// Not: Railway'de açılış senkronu + /language + guildCreate otomatik halleder,
// bu betik genelde gerekmez.
require('dotenv').config();
const https = require('https');
const { buildGuildCommands } = require('./schema');

function guildDilleri() {
  const ids = (process.env.GUILD_IDS || process.env.GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  const eslesme = {};
  for (const parca of (process.env.GUILD_LANGS || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [id, lang] = parca.split(':').map(s => (s || '').trim());
    if (id) eslesme[id] = lang === 'en' ? 'en' : 'tr';
  }
  return ids.map(id => ({ id, lang: eslesme[id] || 'tr' }));
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
    const hedefler = guildDilleri();
    if (!hedefler.length) {
      console.log('GUILD_IDS yok; global kayıt yapılmıyor (çift komut olmaması için).');
      return;
    }
    for (const { id, lang } of hedefler) {
      const commands = buildGuildCommands(lang);
      await put(`/api/v10/applications/${process.env.CLIENT_ID}/guilds/${id}/commands`, commands);
      console.log(`${commands.length} komut kaydedildi: ${id} [${lang}]`);
    }
  } catch (e) {
    console.error('Deploy hatası:', e.message);
    process.exitCode = 1;
  }
})();
