const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'zar', en: 'dice' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'dice.desc'))
    .addIntegerOption(o => o.setName('adet').setDescription(t(lang, 'dice.opt.n')).setRequired(false).setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName('yuz').setDescription(t(lang, 'dice.opt.sides')).setRequired(false).setMinValue(2).setMaxValue(100));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const adet = interaction.options.getInteger('adet') || 1;
    const yuz = interaction.options.getInteger('yuz') || 6;
    const rolls = Array.from({ length: adet }, () => 1 + Math.floor(Math.random() * yuz));
    const toplam = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply(
      adet === 1
        ? t(L, 'dice.one', { u: interaction.user, n: rolls[0], y: yuz })
        : t(L, 'dice.many', { u: interaction.user, a: adet, r: rolls.join(', '), t: toplam })
    );
  }

  return { data, execute };
}

module.exports = { build };
