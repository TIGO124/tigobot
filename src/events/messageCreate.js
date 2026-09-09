const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { effectiveModel, defaultNvidia } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { guvenilirMi } = require('../trust');
const { t, getLang } = require('../i18n');
const { aiAkis, durumEmbed, animMetni } = require('../ai-progress');

// İsmi geçen veya etiketlenen mesajlarda bota soru sorulmuş sayılır.
// Örnek: "nasılsın tigobot" -> soru "nasılsın" olur.
async function handleMention(message) {
  const botId = message.client.user.id;
  const etiketlendi = message.mentions.has(botId);
  const ismiGecti = /\btigobot\b/i.test(message.content);
  if (!etiketlendi && !ismiGecti) return false;

  let soru = message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ');
  soru = soru.replace(/^\s*tigobot\b[,.!:\s]*/i, '').replace(/[\s,.!:?]*\btigobot\s*[?.!]*$/i, '').trim();
  const L0 = getLang(message.guildId);
  if (!soru) {
    await message.reply(t(L0, 'ai.listening'));
    return true;
  }
  if (soru.length > MAX_SORU) {
    await message.reply(t(L0, 'ai.toolong', { max: MAX_SORU }));
    return true;
  }
  const sahipMi = message.guild?.ownerId === message.author.id;
  if (!guvenilirMi(message.guildId, message.author.id, sahipMi)) {
    const kalan = cooldownLeft(message.author.id, message.guildId);
    if (kalan > 0) {
      await message.reply(t(L0, 'ai.cooldown', { kalan }));
      return true;
    }
    markCooldown(message.author.id, message.guildId);
  }

  const model = effectiveModel(message.guildId);
  const baslangic = animMetni(0, L0);
  let mesaj;
  try {
    mesaj = await message.reply({ embeds: [durumEmbed(baslangic, L0)] });
  } catch {
    return true;
  }
  await aiAkis({
    mesaj,
    ekGonder: o => message.channel.send(o),
    userId: message.author.id,
    userTag: message.author.tag,
    guildId: message.guildId,
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
        const warn = await message.channel.send(t(getLang(message.guildId), 'filter.warn', { u: message.author }));
        setTimeout(() => warn.delete().catch(() => {}), 5000);
      } catch {}
    }
  },
};
