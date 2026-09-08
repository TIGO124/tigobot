const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kullanici-bilgi')
    .setDescription('Bir kullanıcının bilgilerini gösterir')
    .addUserOption(o => o.setName('kullanici').setDescription('Bilgisi alınacak kişi').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(0x57F287)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Hesap Kuruluş', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Sunucuya Katılma', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor', inline: true },
        { name: 'Roller', value: member ? member.roles.cache.map(r => r.toString()).slice(0, 10).join(' ') || 'Yok' : 'Bilinmiyor' },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
