const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yazi-tura')
    .setDescription('Yazı tura atar'),
  async execute(interaction) {
    const sonuc = Math.random() < 0.5 ? 'Yazı' : 'Tura';
    await interaction.reply(`${interaction.user} yazı tura attı: **${sonuc}**`);
  },
};
