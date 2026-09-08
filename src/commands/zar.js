const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zar')
    .setDescription('Zar atar')
    .addIntegerOption(o => o.setName('adet').setDescription('Kaç zar (1-10)').setRequired(false).setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName('yuz').setDescription('Zar kaç yüzlü (2-100)').setRequired(false).setMinValue(2).setMaxValue(100)),
  async execute(interaction) {
    const adet = interaction.options.getInteger('adet') || 1;
    const yuz = interaction.options.getInteger('yuz') || 6;
    const rolls = Array.from({ length: adet }, () => 1 + Math.floor(Math.random() * yuz));
    const toplam = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply(
      adet === 1
        ? `${interaction.user} zar attı: **${rolls[0]}** (1-${yuz})`
        : `${interaction.user} ${adet} zar attı: **${rolls.join(', ')}** | Toplam: **${toplam}**`
    );
  },
};
