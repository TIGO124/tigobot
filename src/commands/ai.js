const { SlashCommandBuilder } = require('discord.js');
const { getGuildModel } = require('../ai-models');
const { chat, splitText } = require('../ai');
const { sanitize } = require('../sanitize');

// Kredi yakmayı ve spamı önlemek için kullanıcı başına bekleme süresi
const bekleme = new Map();
const BEKLEME_MS = 20 * 1000;
const MAX_SORU = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Yapay zekaya soru sor (model: /aimodels)')
    .addStringOption(o => o.setName('soru').setDescription('Sorun ne?').setRequired(true)),
  async execute(interaction) {
    const soru = interaction.options.getString('soru');
    if (soru.length > MAX_SORU) {
      return interaction.reply({ content: `Soru çok uzun (en fazla ${MAX_SORU} karakter).`, ephemeral: true });
    }
    const simdi = Date.now();
    const son = bekleme.get(interaction.user.id) || 0;
    if (simdi - son < BEKLEME_MS) {
      const kalan = Math.ceil((BEKLEME_MS - (simdi - son)) / 1000);
      return interaction.reply({ content: `Biraz yavaş. ${kalan} saniye sonra tekrar dene.`, ephemeral: true });
    }
    bekleme.set(interaction.user.id, simdi);
    await interaction.deferReply();
    try {
      const model = getGuildModel(interaction.guildId);
      const cevap = await chat(model, [{ role: 'user', content: soru }]);
      const parts = splitText(`**${model.name}**\n${cevap}`);
      await interaction.editReply(parts[0].slice(0, 2000));
      for (const p of parts.slice(1)) {
        await interaction.followUp(p.slice(0, 2000));
      }
    } catch (e) {
      await interaction.editReply(`Hata: ${sanitize(e.message)}`.slice(0, 2000));
    }
  },
};
