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
    const yanitla = (payload) => {
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
      return interaction.reply(payload).catch(() => {});
    };
    try {
      const silinen = await interaction.channel.bulkDelete(amount, true);
      // İstenen değil GERÇEKTEN silinen sayı (14+ günlükler atlanır)
      const n = silinen && typeof silinen.size === 'number' ? silinen.size : amount;
      await yanitla({ content: t(L, 'clear.done', { n }), ephemeral: true });
    } catch {
      await yanitla({ content: t(L, 'clear.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
