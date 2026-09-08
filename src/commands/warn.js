const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

async function sendLog(interaction, embed) {
  const logId = process.env.LOG_CHANNEL_ID;
  let channel = logId ? interaction.guild.channels.cache.get(logId) : null;
  if (!channel) {
    channel = interaction.guild.channels.cache.find(c =>
      c.isTextBased() && ['log', 'mod-log', 'ceza-log', 'kayıt'].some(n => c.name.toLowerCase().includes(n))
    );
  }
  if (channel && channel.isTextBased()) {
    try { await channel.send({ embeds: [embed] }); } catch {}
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Bir üyeyi uyarır')
    .addUserOption(o => o.setName('kullanici').setDescription('Uyarılacak kişi').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

    const embed = new EmbedBuilder()
      .setTitle('Uyarı')
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Kullanıcı', value: `${user.tag} (${user.id})` },
        { name: 'Yetkili', value: interaction.user.tag },
        { name: 'Sebep', value: reason },
      )
      .setTimestamp();

    try { await user.send(`**${interaction.guild.name}** sunucusunda uyarıldın.\nSebep: ${reason}`); } catch {}

    await interaction.reply({ embeds: [embed] });
    await sendLog(interaction, embed);
  },
};
