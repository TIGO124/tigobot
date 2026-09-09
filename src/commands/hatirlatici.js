const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { clip } = require('../sanitize');

const NAMES = { tr: 'hatirlatici', en: 'reminder' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'rem.desc'))
    .addIntegerOption(o => o.setName('sure').setDescription(t(lang, 'rem.opt.time')).setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o => o.setName('mesaj').setDescription(t(lang, 'rem.opt.msg')).setRequired(true));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const dakika = interaction.options.getInteger('sure');
    const mesaj = clip(interaction.options.getString('mesaj'), 1500);
    await interaction.reply(t(L, 'rem.ok', { u: interaction.user, dk: dakika, m: mesaj }));
    setTimeout(() => {
      interaction.channel.send(t(L, 'rem.fire', { u: interaction.user, m: mesaj })).catch(() => {});
    }, dakika * 60 * 1000);
  }

  return { data, execute };
}

module.exports = { build };
