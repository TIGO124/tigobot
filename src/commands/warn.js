const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'warn', en: 'warn' };

async function sendLog(interaction, embed) {
  const logId = process.env.LOG_CHANNEL_ID;
  let channel = logId ? interaction.guild.channels.cache.get(logId) : null;
  if (!channel) {
    channel = interaction.guild.channels.cache.find(c =>
      c.isTextBased() && ['log', 'mod-log', 'ceza-log', 'kayıt'].some(n => c.name.toLowerCase().includes(n))
    );
  }
  if (channel && channel.isTextBased()) {
    try { await channel.send({ embeds: [embed] }); } catch {}
  }
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'warn.desc'))
    .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'warn.opt.user')).setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription(t(lang, 'warn.opt.reason')).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const user = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep') || t(L, 'warn.noreason');
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'warn.title'))
      .setColor(0xFEE75C)
      .addFields(
        { name: t(L, 'warn.f.user'), value: `${user.tag} (${user.id})` },
        { name: t(L, 'warn.f.mod'), value: interaction.user.tag },
        { name: t(L, 'warn.f.reason'), value: reason },
      )
      .setTimestamp();
    try { await user.send(t(L, 'warn.dm', { g: interaction.guild.name, r: reason })); } catch {}
    await interaction.reply({ embeds: [embed] });
    await sendLog(interaction, embed);
  }

  return { data, execute };
}

module.exports = { build };
