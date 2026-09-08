const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hatirlatici')
    .setDescription('Belirttiğin süre sonra hatırlatma gönderir')
    .addIntegerOption(o => o.setName('sure').setDescription('Kaç dakika sonra (1-10080)').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o => o.setName('mesaj').setDescription('Hatırlatma mesajı').setRequired(true)),
  async execute(interaction) {
    const dakika = interaction.options.getInteger('sure');
    const mesaj = interaction.options.getString('mesaj');
    await interaction.reply(`${interaction.user}, tamam. **${dakika} dakika** sonra hatırlatacağım: "${mesaj}"`);
    setTimeout(() => {
      interaction.channel.send(`${interaction.user} Hatırlatma: "${mesaj}"`).catch(() => {});
    }, dakika * 60 * 1000);
  },
};
