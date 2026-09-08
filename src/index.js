require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const { handle: handleButton } = require('./buttons');
const { updateCounter } = require('./counter');
const { sanitize } = require('./sanitize');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

client.commands = new Collection();

// Komutları yükle (bozuk dosya diğerlerini engellemesin)
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
    else console.error(`Komut atlandı (${file}): data/execute eksik`);
  } catch (e) {
    console.error(`Komut yüklenemedi (${file}): ${e.message}`);
  }
}

// Eventleri yükle
const eventsPath = path.join(__dirname, 'events');
let eventSayi = 0;
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  try {
    const evt = require(path.join(eventsPath, file));
    if (!evt.name || !evt.execute) {
      console.error(`Event atlandı (${file}): name/execute eksik`);
      continue;
    }
    if (evt.once) client.once(evt.name, (...a) => evt.execute(...a));
    else client.on(evt.name, (...a) => evt.execute(...a));
    eventSayi++;
  } catch (e) {
    console.error(`Event yüklenemedi (${file}): ${e.message}`);
  }
}
console.log(`${client.commands.size} komut, ${eventSayi} event yüklendi.`);
if (typeof handleButton !== 'function') {
  console.error('KRİTİK: buton karşılayıcı yüklenemedi, butonlar çalışmaz!');
}

client.once(Events.ClientReady, c => {
  console.log(`Giriş yapıldı: ${c.user.tag}`);
  // Sayaç kanalını 10 dakikada bir tazele
  setInterval(() => {
    c.guilds.cache.forEach(g => updateCounter(g).catch(() => {}));
  }, 10 * 60 * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    try {
      await handleButton(interaction);
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'İşlem sırasında hata oluştu!', ephemeral: true }).catch(() => {});
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Komutta hata oluştu!', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Komutta hata oluştu!', ephemeral: true }).catch(() => {});
    }
  }
});

if (!process.env.TOKEN) {
  console.error('TOKEN bulunamadı! Railway Variables veya .env dosyasını kontrol et.');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
  console.error('Discord girişi başarısız. TOKEN yanlış olabilir (Bot sekmesindeki token olmalı, Uygulama ID değil):', sanitize(err.message));
  process.exit(1);
});
