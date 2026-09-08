const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'clear', en: 'clear' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'clear.desc'))
    .addIntegerOption(o => o.setName('adet').setDescription(t(lang, 'clear.opt')).setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const amount = interaction.options.getInteger('adet');
    try {
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: t(L, 'clear.done', { n: amount }), ephemeral: true });
    } catch {
      await interaction.reply({ content: t(L, 'clear.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
