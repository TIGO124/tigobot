const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getGuildModel, defaultNvidia } = require('../ai-models');
const { chatWithFallback, cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { sanitize } = require('../sanitize');
const { aiEmbeds } = require('../ai-reply');

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

  await message.channel.sendTyping().catch(() => {});
  const yaziyor = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
  try {
    const model = getGuildModel(message.guildId);
    const { text, model: kullanilan, fallback } = await chatWithFallback(model, defaultNvidia(), [{ role: 'user', content: soru }]);
    const embeds = aiEmbeds(kullanilan, text, fallback);
    await message.reply({ embeds: [embeds[0]] });
    for (const e of embeds.slice(1)) {
      await message.channel.send({ embeds: [e] });
    }
  } catch (e) {
    await message.reply(`Hata: ${sanitize(e.message)}`.slice(0, 2000));
  } finally {
    clearInterval(yaziyor);
  }
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
