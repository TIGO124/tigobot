const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'yazi-tura', en: 'coinflip' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'coin.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const sonuc = Math.random() < 0.5 ? t(L, 'coin.heads') : t(L, 'coin.tails');
    await interaction.reply(t(L, 'coin.msg', { u: interaction.user, s: sonuc }));
  }

  return { data, execute };
}

module.exports = { build };
