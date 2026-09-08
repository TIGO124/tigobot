const { SlashCommandBuilder } = require('discord.js');
const { getGuildModel, defaultNvidia } = require('../ai-models');
const { chatWithFallback, cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { sanitize } = require('../sanitize');
const { aiEmbeds } = require('../ai-reply');

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
    const kalan = cooldownLeft(interaction.user.id);
    if (kalan > 0) {
      return interaction.reply({ content: `Biraz yavaş. ${kalan} saniye sonra tekrar dene.`, ephemeral: true });
    }
    markCooldown(interaction.user.id);
    await interaction.deferReply();
    try {
      const model = getGuildModel(interaction.guildId);
      const { text, model: kullanilan, fallback } = await chatWithFallback(model, defaultNvidia(), [{ role: 'user', content: soru }]);
      const embeds = aiEmbeds(kullanilan, text, fallback);
      await interaction.editReply({ embeds: [embeds[0]] });
      for (const e of embeds.slice(1)) {
        await interaction.followUp({ embeds: [e] });
      }
    } catch (e) {
      await interaction.editReply(`Hata: ${sanitize(e.message)}`.slice(0, 2000));
    }
  },
};
