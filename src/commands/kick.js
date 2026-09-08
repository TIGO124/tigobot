const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Bir üyeyi sunucudan atar')
    .addUserOption(o => o.setName('kullanici').setDescription('Atılacak kişi').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('kullanici');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
    if (!member) return interaction.reply({ content: 'Kullanıcı sunucuda değil.', ephemeral: true });
    if (!member.kickable) return interaction.reply({ content: 'Bu kişiyi atamam (yetkim yetmiyor).', ephemeral: true });
    try {
      await member.kick(reason);
      await interaction.reply(`${member.user.tag} atıldı. Sebep: ${reason}`);
    } catch (e) {
      await interaction.reply({ content: 'Atma işlemi yapılamadı. Yetkilerimi ve rol sıramı kontrol et.', ephemeral: true });
    }
  },
};
