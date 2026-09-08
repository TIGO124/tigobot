require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');

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

// Komutları yükle
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

// Eventleri yükle
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const evt = require(path.join(eventsPath, file));
  if (evt.once) client.once(evt.name, (...a) => evt.execute(...a));
  else client.on(evt.name, (...a) => evt.execute(...a));
}

client.once(Events.ClientReady, c => {
  console.log(`Giriş yapıldı: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
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
  console.error('Discord girişi başarısız. TOKEN yanlış olabilir (Bot sekmesindeki token olmalı, Uygulama ID değil):', err.message);
  process.exit(1);
});
