const { SlashCommandBuilder } = require('discord.js');

const cevaplar = [
  'Kesinlikle evet.',
  'Evet, hiç şüphen olmasın.',
  'Büyük ihtimalle evet.',
  'Olabilir, şans senden yana.',
  'Belki, biraz daha bekle.',
  'Şu an net değil, sonra tekrar sor.',
  'Bence hayır.',
  'Kesinlikle hayır.',
  'Hiç sanmıyorum.',
  'Yıldızlar pek uygun değil.',
  'Evet, ama acele etme.',
  'Hayır, başka bir yol dene.',
  'Kaderin cevabı: evet.',
  'Kaderin cevabı: hayır.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Soruna sihirli 8 topu cevap verir')
    .addStringOption(o => o.setName('soru').setDescription('Sorun ne?').setRequired(true)),
  async execute(interaction) {
    const soru = interaction.options.getString('soru');
    const cevap = cevaplar[Math.floor(Math.random() * cevaplar.length)];
    await interaction.reply(`Soru: **${soru}**\nCevap: **${cevap}**`);
  },
};
