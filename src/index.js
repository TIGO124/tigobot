require('dotenv').config();
require('./logger').install();
require('./guards').installGuards();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const { handle: handleButton } = require('./buttons');
const { updateCounter } = require('./counter');
const { sanitize } = require('./sanitize');
const { t, getLang } = require('./i18n');
const { load, save } = require('./store');
const { CODE_VERSION, buildGuildCommands, registerGuildCommands } = require('./schema');
const { kullanabilirMi, retMesaji } = require('./owner');

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

// Komutları yükle (her dosya build(lang) verir; iki dil de kaydedilir)
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const mod = require(path.join(commandsPath, file));
    if (!mod.build) {
      console.error(`Komut atlandı (${file}): build eksik`);
      continue;
    }
    for (const L of ['tr', 'en']) {
      const cmd = mod.build(L);
      if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd.execute);
      else console.error(`Komut atlandı (${file}/${L}): data/execute eksik`);
    }
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
console.log(`${client.commands.size} komut adı, ${eventSayi} event yüklendi.`);

client.once(Events.ClientReady, async c => {
  console.log(`Giriş yapıldı: ${c.user.tag}`);
  // Web panel (DASHBOARD_PORT tanımlıysa açılır)
  try {
    require('./dashboard').start(c);
  } catch (e) {
    console.error('Panel açılamadı:', e.message);
  }
  // Sayaç kanalını 10 dakikada bir tazele
  setInterval(() => {
    c.guilds.cache.forEach(g => updateCounter(g).catch(() => {}));
  }, 10 * 60 * 1000);
  // Komut şeması eski kalan sunucuları güncelle
  try {
    const sv = load('schema.json', {});
    let degisti = false;
    for (const g of c.guilds.cache.values()) {
      if (sv[g.id] === CODE_VERSION) continue;
      const lang = getLang(g.id);
      try {
        await registerGuildCommands(g.id, lang, c);
        sv[g.id] = CODE_VERSION;
        degisti = true;
        console.log(`Komut şeması güncellendi: ${g.name} [${lang}]`);
      } catch (e) {
        console.error(`Şema güncellenemedi (${g.name}): ${e.message}`);
      }
    }
    if (degisti) save('schema.json', sv);
  } catch (e) {
    console.error('Şema senkron hatası:', e.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  // ÖZEL BOT KİLİDİ: sadece sahip (caglar_007 / OWNER_ID) + beta-testerlar kullanabilir.
  // Buton + slash komut dahil tüm etkileşimler burada kesilir.
  if (interaction.isButton() || interaction.isChatInputCommand()) {
    try {
      if (!kullanabilirMi(interaction.user)) {
        const L = getLang(interaction.guildId);
        const msg = retMesaji(L);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
        }
        return;
      }
    } catch {}
  }
  if (interaction.isButton()) {
    try {
      await handleButton(interaction);
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: t(getLang(interaction.guildId), 'err.btn'), ephemeral: true }).catch(() => {});
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const exec = client.commands.get(interaction.commandName);
  if (!exec) return;
  try {
    await exec(interaction);
  } catch (e) {
    console.error(e);
    const msg = t(getLang(interaction.guildId), 'err.cmd');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
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
