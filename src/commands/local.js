const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { acikMi, ayarla } = require('../local');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('local')
    .setDescription('Yerel AI modelini açar/kapatır (sadece bot sahibi)')
    .addSubcommand(s => s.setName('ac').setDescription('Yerel modeli açar'))
    .addSubcommand(s => s.setName('kapat').setDescription('Yerel modeli kapatır (hep nvidia kullanılır)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: 'Bot sahibi IDsi ayarlı değil (OWNER_ID).', ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: 'Bu komutu sadece bot sahibi kullanabilir.', ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'ac') {
      ayarla(true);
      return interaction.reply({ content: 'Yerel AI açıldı. Yerel model seçiliyken önce PCndeki Ollama denenecek.', ephemeral: true });
    }
    ayarla(false);
    return interaction.reply({ content: 'Yerel AI kapatıldı. Artık hep nvidia modelleri cevap verecek.', ephemeral: true });
  },
};
