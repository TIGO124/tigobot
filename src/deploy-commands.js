// Manuel komut kaydı (discord.js REST; düzgün ağ gerektirir).
// GUILD_IDS + GUILD_LANGS kullanır, örn: GUILD_LANGS=123:tr,456:en
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { buildGuildCommands } = require('./schema');

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    const ids = (process.env.GUILD_IDS || process.env.GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    const eslesme = {};
    for (const parca of (process.env.GUILD_LANGS || '').split(',').map(s => s.trim()).filter(Boolean)) {
      const [id, lang] = parca.split(':').map(s => (s || '').trim());
      if (id) eslesme[id] = lang === 'en' ? 'en' : 'tr';
    }
    if (!ids.length) {
      console.log('GUILD_IDS yok; global kayıt yapılmıyor (çift komut olmaması için).');
      return;
    }
    console.log(`${ids.length} sunucuya kaydediliyor...`);
    for (const id of ids) {
      const lang = eslesme[id] || 'tr';
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, id),
        { body: buildGuildCommands(lang) },
      );
      console.log(`Kaydedildi: ${id} [${lang}]`);
    }
  } catch (e) {
    console.error('Deploy hatası:', e.message);
  }
})();
