const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Bir üyeyi susturur')
    .addUserOption(o => o.setName('kullanici').setDescription('Susturulacak kişi').setRequired(true))
    .addIntegerOption(o => o.setName('sure').setDescription('Dakika (1-40320)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('kullanici');
    const minutes = interaction.options.getInteger('sure');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

    if (!member) return interaction.reply({ content: 'Kullanıcı sunucuda bulunamadı.', ephemeral: true });
    if (!member.moderatable) return interaction.reply({ content: 'Bu kullanıcıya timeout atamam (rolümden yüksek olabilir).', ephemeral: true });

    try {
      await member.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setTitle('Timeout')
        .setColor(0xEB459E)
        .setDescription(`${member.user.tag} **${minutes} dakika** susturuldu.\nSebep: ${reason}`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      await interaction.reply({ content: 'Susturma yapılamadı. Yetkilerimi ve rol sıramı kontrol et.', ephemeral: true });
    }
  },
};
