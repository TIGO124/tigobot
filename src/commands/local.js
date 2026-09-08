const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { acikMi, ayarla } = require('../local');

const NAMES = { tr: 'local', en: 'local' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'local.desc'))
    .addSubcommand(s => s.setName('ac').setDescription(t(lang, 'local.sub.on')))
    .addSubcommand(s => s.setName('kapat').setDescription(t(lang, 'local.sub.off')))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.noOwner'), ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'ac') {
      ayarla(true);
      return interaction.reply({ content: t(L, 'local.on'), ephemeral: true });
    }
    ayarla(false);
    return interaction.reply({ content: t(L, 'local.off'), ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
