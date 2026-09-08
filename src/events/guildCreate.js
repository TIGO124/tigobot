const { Events } = require('discord.js');
const { setLang } = require('../i18n');
const { load, save } = require('../store');
const { CODE_VERSION, registerGuildCommands } = require('../schema');

function toplaKomutlar(lang) {
  return require('../schema').buildGuildCommands(lang);
}

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    try {
      // Yeni sunucularda varsayılan dil İngilizce
      setLang(guild.id, 'en');
      if (!process.env.TOKEN) {
        console.error('Otomatik komut kaydı atlandı: TOKEN eksik');
        return;
      }
      await registerGuildCommands(guild.id, 'en', guild.client);
      const sv = load('schema.json', {});
      sv[guild.id] = CODE_VERSION;
      save('schema.json', sv);
      console.log(`Komutlar yeni sunucuya kaydedildi: ${guild.name} (${guild.id}) [en]`);
    } catch (e) {
      console.error(`Otomatik komut kaydı başarısız (${guild.id}):`, e.message);
    }
  },
  toplaKomutlar,
};
