const { SlashCommandBuilder } = require('discord.js');
const { getGuildModel } = require('../ai-models');
const { chat, splitText } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Yapay zekaya soru sor (model: /aimodels)')
    .addStringOption(o => o.setName('soru').setDescription('Sorun ne?').setRequired(true)),
  async execute(interaction) {
    const soru = interaction.options.getString('soru');
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
      await interaction.editReply(`Hata: ${e.message}`.slice(0, 2000));
    }
  },
};
