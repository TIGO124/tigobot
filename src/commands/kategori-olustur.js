const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kategori-olustur')
    .setDescription('Yeni kategori (grup) açar')
    .addStringOption(o => o.setName('ad').setDescription('Kategori adı').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const ad = interaction.options.getString('ad');
    try {
      const kat = await interaction.guild.channels.create({ name: ad, type: ChannelType.GuildCategory });
      await interaction.reply(`Kategori oluşturuldu: **${kat.name}**`);
    } catch (e) {
      await interaction.reply({ content: `Kategori açılamadı: ${e.message}`, ephemeral: true });
    }
  },
};
