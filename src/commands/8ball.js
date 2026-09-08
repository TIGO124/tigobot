const { SlashCommandBuilder } = require('discord.js');
const { t, getLang, ballAnswers } = require('../i18n');

const NAMES = { tr: '8ball', en: '8ball' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'ball.desc'))
    .addStringOption(o => o.setName('soru').setDescription(t(lang, 'ball.opt')).setRequired(true));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const soru = interaction.options.getString('soru');
    const cevaplar = ballAnswers(L);
    const cevap = cevaplar[Math.floor(Math.random() * cevaplar.length)];
    await interaction.reply(t(L, 'ball.msg', { s: soru, c: cevap }));
  }

  return { data, execute };
}

module.exports = { build };
