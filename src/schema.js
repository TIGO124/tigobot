const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Şema değişince artır: bot açılışta sürümü eski sunucuların komutlarını yeniler.
const CODE_VERSION = 10;

function buildGuildCommands(lang) {
  const out = [];
  const dir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(dir, file));
    if (mod.build) out.push(mod.build(lang).data.toJSON());
  }
  return out;
}

async function registerGuildCommands(guildId, lang, client) {
  const clientId = (client && client.user && client.user.id) || process.env.CLIENT_ID;
  if (!process.env.TOKEN || !clientId) throw new Error('TOKEN/CLIENT_ID eksik');
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: buildGuildCommands(lang) });
}

module.exports = { CODE_VERSION, buildGuildCommands, registerGuildCommands };
