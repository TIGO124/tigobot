const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kanal-olustur')
    .setDescription('Yeni metin veya ses kanalı açar')
    .addStringOption(o => o.setName('ad').setDescription('Kanal adı').setRequired(true))
    .addStringOption(o => o.setName('tur').setDescription('Kanal türü').setRequired(true)
      .addChoices(
        { name: 'Metin', value: 'metin' },
        { name: 'Ses', value: 'ses' },
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const ad = interaction.options.getString('ad').toLowerCase().replace(/\s+/g, '-');
    const tur = interaction.options.getString('tur');
    try {
      const kanal = await interaction.guild.channels.create({
        name: ad,
        type: tur === 'ses' ? ChannelType.GuildVoice : ChannelType.GuildText,
      });
      await interaction.reply(`Kanal oluşturuldu: ${kanal} (${tur === 'ses' ? 'ses' : 'metin'})`);
    } catch (e) {
      await interaction.reply({ content: `Kanal açılamadı: ${e.message}`, ephemeral: true });
    }
  },
};
