// Global komutları temizler (sunucuya özel komutlarla çift görünmeyi önler).
// Node https modülü kullanır (yerel ağdaki undici sorunundan etkilenmez).
require('dotenv').config();
const https = require('https');

function istek(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'discord.com',
      path: pathname,
      method,
      headers: {
        Authorization: `Bot ${process.env.TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        'User-Agent': 'TigoBot-deploy (node-https)',
      },
      timeout: 20000,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw ? JSON.parse(raw) : null);
        else reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('HTTPS timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    // Yıkıcı işlem onaysız çalışmasın (yanlış CLIENT_ID ile prod silinmesin).
    if (!process.argv.includes('--yes')) {
      console.log('YIKICI İŞLEM: tüm GLOBAL komutlar silinir. Eminsen: node src/clear-global.js --yes');
      process.exitCode = 2;
      return;
    }
    if (!process.env.TOKEN || !process.env.CLIENT_ID) throw new Error('.env içinde TOKEN/CLIENT_ID eksik');
    const once = await istek('GET', `/api/v10/applications/${process.env.CLIENT_ID}/commands`);
    console.log(`Global komut sayısı (önce): ${once.length}`);
    await istek('PUT', `/api/v10/applications/${process.env.CLIENT_ID}/commands`, []);
    const sonra = await istek('GET', `/api/v10/applications/${process.env.CLIENT_ID}/commands`);
    console.log(`Global komut sayısı (sonra): ${sonra.length}`);
    const guildIds = (process.env.GUILD_IDS || process.env.GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const gid of guildIds) {
      const guild = await istek('GET', `/api/v10/applications/${process.env.CLIENT_ID}/guilds/${gid}/commands`);
      console.log(`Sunucu komut sayısı [${gid}]: ${guild.length} (bunlar kalıyor)`);
    }
    if (!guildIds.length) console.log('GUILD_IDS tanımlı değil; sunucu komut sayımı atlandı.');
  } catch (e) {
    console.error('Hata:', e.message);
    process.exitCode = 1;
  }
})();
