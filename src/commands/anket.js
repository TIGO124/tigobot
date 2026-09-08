const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { save, load } = require('../store');

function anketEmbed(soru, secenekler, counts) {
  const toplam = counts.reduce((a, b) => a + b, 0);
  const satirlar = secenekler.map((s, i) => {
    const oy = counts[i] || 0;
    const yuzde = toplam ? Math.round((oy / toplam) * 100) : 0;
    return `**${i + 1}. ${s}** — ${oy} oy (%${yuzde})`;
  });
  return new EmbedBuilder()
    .setTitle(`Anket: ${soru}`)
    .setDescription(satirlar.join('\n'))
    .setColor(0x5865F2)
    .setFooter({ text: `Toplam oy: ${toplam} | Oy vermek için butona bas` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anket')
    .setDescription('Butonlu anket başlatır (en fazla 4 seçenek)')
    .addStringOption(o => o.setName('soru').setDescription('Anket sorusu').setRequired(true))
    .addStringOption(o => o.setName('secenek1').setDescription('1. seçenek').setRequired(true))
    .addStringOption(o => o.setName('secenek2').setDescription('2. seçenek').setRequired(true))
    .addStringOption(o => o.setName('secenek3').setDescription('3. seçenek').setRequired(false))
    .addStringOption(o => o.setName('secenek4').setDescription('4. seçenek').setRequired(false)),
  async execute(interaction) {
    const soru = interaction.options.getString('soru');
    const secenekler = [1, 2, 3, 4]
      .map(i => interaction.options.getString(`secenek${i}`))
      .filter(Boolean);

    const pollId = Date.now().toString(36) + Math.floor(Math.random() * 999);
    const row = new ActionRowBuilder().addComponents(
      secenekler.map((s, i) =>
        new ButtonBuilder()
          .setCustomId(`anket_${pollId}_${i}`)
          .setLabel(`${i + 1}. ${s}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      )
    );

    const msg = await interaction.reply({
      embeds: [anketEmbed(soru, secenekler, secenekler.map(() => 0))],
      components: [row],
      fetchReply: true,
    });

    const polls = load('ankets.json', {});
    polls[pollId] = { messageId: msg.id, channelId: msg.channelId, guildId: interaction.guildId, soru, secenekler, counts: secenekler.map(() => 0), voters: {} };
    save('ankets.json', polls);
  },
  anketEmbed,
};
