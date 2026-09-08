const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'kategori-olustur', en: 'create-category' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'mkcat.desc'))
    .addStringOption(o => o.setName('ad').setDescription(t(lang, 'mkcat.opt')).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const ad = interaction.options.getString('ad');
    try {
      const kat = await interaction.guild.channels.create({ name: ad, type: ChannelType.GuildCategory });
      await interaction.reply(t(L, 'mkcat.done', { n: kat.name }));
    } catch {
      await interaction.reply({ content: t(L, 'mkcat.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
