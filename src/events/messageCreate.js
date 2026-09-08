const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getGuildModel, defaultNvidia } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { aiAkis, durumEmbed, animMetni } = require('../ai-progress');

// İsmi geçen veya etiketlenen mesajlarda bota soru sorulmuş sayılır.
// Örnek: "nasılsın tigo" -> soru "nasılsın" olur.
async function handleMention(message) {
  const botId = message.client.user.id;
  const etiketlendi = message.mentions.has(botId);
  const ismiGecti = /\btigo\b/i.test(message.content);
  if (!etiketlendi && !ismiGecti) return false;

  let soru = message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ');
  soru = soru.replace(/^\s*tigo\b[,.!:\s]*/i, '').replace(/[\s,.!:?]*\btigo\s*[?.!]*$/i, '').trim();
  if (!soru) {
    await message.reply('Seni dinliyorum. Örnek: nasılsın tigo');
    return true;
  }
  if (soru.length > MAX_SORU) {
    await message.reply(`Sorun çok uzun (en fazla ${MAX_SORU} karakter).`);
    return true;
  }
  const kalan = cooldownLeft(message.author.id);
  if (kalan > 0) {
    await message.reply(`Biraz yavaş. ${kalan} saniye sonra tekrar dene.`);
    return true;
  }
  markCooldown(message.author.id);

  const model = getGuildModel(message.guildId);
  const baslangic = animMetni(0);
  let mesaj;
  try {
    mesaj = await message.reply({ embeds: [durumEmbed(baslangic, model.name)] });
  } catch {
    return true;
  }
  await aiAkis({
    mesaj,
    ekGonder: o => message.channel.send(o),
    userId: message.author.id,
    userTag: message.author.tag,
    model,
    yedek: defaultNvidia(),
    soru,
    baslangic,
  });
  return true;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    try {
      if (await handleMention(message)) return;
    } catch {}

    if (!message.guild) return;
    // Yetkilileri atla
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const content = message.content.toLowerCase();
    const hasBanned = config.bannedWords.some(w => content.includes(w.toLowerCase()));
    const hasInvite = config.blockInvites && config.inviteRegex.test(message.content);

    if (hasBanned || hasInvite) {
      try { await message.delete(); } catch {}
      try {
        const warn = await message.channel.send(`${message.author}, Bu tür mesajlar bu sunucuda yasak!`);
        setTimeout(() => warn.delete().catch(() => {}), 5000);
      } catch {}
    }
  },
};
