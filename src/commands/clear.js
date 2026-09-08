const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Mesajları toplu siler (1-100)')
    .addIntegerOption(o => o.setName('adet').setDescription('Silinecek sayı').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const amount = interaction.options.getInteger('adet');
    try {
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `${amount} mesaj silindi.`, ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: 'Mesajlar silinemedi. 14 günden eski mesajlar toplu silinemez.', ephemeral: true });
    }
  },
};
