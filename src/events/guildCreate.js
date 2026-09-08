const { Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

function toplaKomutlar() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data) commands.push(cmd.data.toJSON());
  }
  return commands;
}

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    try {
      if (!process.env.TOKEN || !process.env.CLIENT_ID) {
        console.error('Otomatik komut kaydı atlandı: TOKEN/CLIENT_ID eksik');
        return;
      }
      const commands = toplaKomutlar();
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
        { body: commands },
      );
      console.log(`Komutlar yeni sunucuya kaydedildi: ${guild.name} (${guild.id})`);
    } catch (e) {
      console.error(`Otomatik komut kaydı başarısız (${guild.id}):`, e.message);
    }
  },
  toplaKomutlar,
};
