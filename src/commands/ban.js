const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { clip } = require('../sanitize');

const NAMES = { tr: 'ban', en: 'ban' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'ban.desc'))
    .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'ban.opt.user')).setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription(t(lang, 'ban.opt.reason')).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const user = interaction.options.getUser('kullanici');
    const reason = clip(interaction.options.getString('sebep') || t(L, 'warn.noreason'), 1500);
    const member = interaction.guild.members.cache.get(user.id);
    if (member && !member.bannable) return interaction.reply({ content: t(L, 'ban.noperm'), ephemeral: true });
    try {
      await interaction.guild.members.ban(user.id, { reason });
      await interaction.reply(t(L, 'ban.done', { tag: user.tag, r: reason }));
    } catch {
      await interaction.reply({ content: t(L, 'ban.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
