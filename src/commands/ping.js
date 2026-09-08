const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botun gecikmesini gösterir'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Ölçülüyor...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong! Gecikme: ${latency}ms | API: ${Math.round(interaction.client.ws.ping)}ms`);
  },
};
