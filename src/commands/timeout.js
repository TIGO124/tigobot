const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { clip } = require('../sanitize');

const NAMES = { tr: 'timeout', en: 'timeout' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'timeout.desc'))
    .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'timeout.opt.user')).setRequired(true))
    .addIntegerOption(o => o.setName('sure').setDescription(t(lang, 'timeout.opt.time')).setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('sebep').setDescription(t(lang, 'timeout.opt.reason')).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const member = interaction.options.getMember('kullanici');
    const minutes = interaction.options.getInteger('sure');
    const reason = clip(interaction.options.getString('sebep') || t(L, 'warn.noreason'), 1500);
    if (!member) return interaction.reply({ content: t(L, 'timeout.notfound'), ephemeral: true });
    if (!member.moderatable) return interaction.reply({ content: t(L, 'timeout.noperm'), ephemeral: true });
    try {
      await member.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'timeout.title'))
        .setColor(0xEB459E)
        .setDescription(t(L, 'timeout.body', { tag: member.user.tag, dk: minutes, r: reason }))
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply({ content: t(L, 'timeout.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
