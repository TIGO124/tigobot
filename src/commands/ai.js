const { SlashCommandBuilder } = require('discord.js');
const { getGuildModel, defaultNvidia } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { sanitize } = require('../sanitize');
const { aiAkis, durumEmbed, animMetni } = require('../ai-progress');

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
    const model = getGuildModel(interaction.guildId);
    const baslangic = animMetni(0);
    await interaction.deferReply();
    const mesaj = await interaction.editReply({ embeds: [durumEmbed(baslangic, model.name)] });
    await aiAkis({
      mesaj,
      ekGonder: o => interaction.followUp(o),
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      model,
      yedek: defaultNvidia(),
      soru,
      baslangic,
    });
  },
};
