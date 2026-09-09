const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t, getLang } = require('../i18n');
const { save, load } = require('../store');
const { clip } = require('../sanitize');

const NAMES = { tr: 'anket', en: 'poll' };

function anketEmbed(soru, secenekler, counts, lang) {
  const toplam = counts.reduce((a, b) => a + b, 0);
  const satirlar = secenekler.map((s, i) => {
    const oy = counts[i] || 0;
    const yuzde = toplam ? Math.round((oy / toplam) * 100) : 0;
    return t(lang, 'poll.row', { i: i + 1, s, oy, y: yuzde });
  });
  return new EmbedBuilder()
    .setTitle(t(lang, 'poll.title', { s: soru }))
    .setDescription(satirlar.join('\n'))
    .setColor(0x5865F2)
    .setFooter({ text: t(lang, 'poll.footer', { t: toplam }) })
    .setTimestamp();
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'poll.desc'))
    .addStringOption(o => o.setName('soru').setDescription(t(lang, 'poll.opt.q')).setRequired(true))
    .addStringOption(o => o.setName('secenek1').setDescription('1').setRequired(true))
    .addStringOption(o => o.setName('secenek2').setDescription('2').setRequired(true))
    .addStringOption(o => o.setName('secenek3').setDescription('3').setRequired(false))
    .addStringOption(o => o.setName('secenek4').setDescription('4').setRequired(false));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const soru = clip(interaction.options.getString('soru'), 240);
    const secenekler = [1, 2, 3, 4]
      .map(i => interaction.options.getString(`secenek${i}`))
      .filter(Boolean)
      .map(s => clip(s, 75));
    const pollId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const row = new ActionRowBuilder().addComponents(
      secenekler.map((s, i) =>
        new ButtonBuilder()
          .setCustomId(`anket_${pollId}_${i}`)
          .setLabel(`${i + 1}. ${s}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      )
    );
    const msg = await interaction.reply({
      embeds: [anketEmbed(soru, secenekler, secenekler.map(() => 0), L)],
      components: [row],
      fetchReply: true,
    });
    const polls = load('ankets.json', {});
    polls[pollId] = { messageId: msg.id, channelId: msg.channelId, guildId: interaction.guildId, soru, secenekler, counts: secenekler.map(() => 0), voters: {} };
    // Eski anketler birikmesin: en son 50 tanesi tutulur
    const keys = Object.keys(polls);
    if (keys.length > 50) {
      for (const k of keys.slice(0, keys.length - 50)) delete polls[k];
    }
    save('ankets.json', polls);
  }

  return { data, execute };
}

module.exports = { build, anketEmbed };
