const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'kullanici-bilgi', en: 'user-info' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'uinfo.desc'))
    .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'uinfo.opt')).setRequired(false));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const user = interaction.options.getUser('kullanici') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(0x57F287)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: t(L, 'uinfo.created'), value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t(L, 'uinfo.joined'), value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : t(L, 'uinfo.unknown'), inline: true },
        { name: t(L, 'uinfo.roles'), value: member ? member.roles.cache.map(r => r.toString()).slice(0, 10).join(' ') || t(L, 'uinfo.noroles') : t(L, 'uinfo.unknown') },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
