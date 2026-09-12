const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Şema değişince artır: bot açılışta sürümü eski sunucuların komutlarını yeniler.
const CODE_VERSION = 10;

function buildGuildCommands(lang) {
  const out = [];
  const dir = path.join(__dirname, 'commands');
  let dosyalar = [];
  try {
    dosyalar = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  } catch (e) {
    throw new Error(`komut klasörü okunamadı: ${e.message}`);
  }
  for (const file of dosyalar) {
    // Tek bozuk komut tüm deploy'u patlatmasın (atlanan logda görünür).
    try {
      const mod = require(path.join(dir, file));
      if (mod.build) out.push(mod.build(lang).data.toJSON());
      else console.error(`Şema atlandı (${file}): build eksik`);
    } catch (e) {
      console.error(`Şema atlandı (${file}): ${e.message}`);
    }
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
