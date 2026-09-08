const { SlashCommandBuilder } = require('discord.js');

function yorum(oran) {
  if (oran >= 90) return 'Efsane bir uyum!';
  if (oran >= 70) return 'Çok iyi anlaşırsınız.';
  if (oran >= 50) return 'İdare eder, şans verin.';
  if (oran >= 30) return 'Biraz zor ama imkansız değil.';
  return 'Hiç uymuyorsunuz, geçmiş olsun.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask-olcer')
    .setDescription('İki kişinin uyumunu ölçer')
    .addUserOption(o => o.setName('kisi1').setDescription('Birinci kişi').setRequired(true))
    .addUserOption(o => o.setName('kisi2').setDescription('İkinci kişi').setRequired(false)),
  async execute(interaction) {
    const k1 = interaction.options.getUser('kisi1');
    const k2 = interaction.options.getUser('kisi2') || interaction.user;
    const oran = Math.floor(Math.random() * 101);
    await interaction.reply(`${k1} + ${k2} uyumu: **%${oran}**\n${yorum(oran)}`);
  },
};
