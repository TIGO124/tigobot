const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'kick', en: 'kick' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'kick.desc'))
    .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'kick.opt.user')).setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription(t(lang, 'kick.opt.reason')).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const member = interaction.options.getMember('kullanici');
    const reason = interaction.options.getString('sebep') || t(L, 'warn.noreason');
    if (!member) return interaction.reply({ content: t(L, 'kick.notin'), ephemeral: true });
    if (!member.kickable) return interaction.reply({ content: t(L, 'kick.noperm'), ephemeral: true });
    try {
      await member.kick(reason);
      await interaction.reply(t(L, 'kick.done', { tag: member.user.tag, r: reason }));
    } catch {
      await interaction.reply({ content: t(L, 'kick.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
