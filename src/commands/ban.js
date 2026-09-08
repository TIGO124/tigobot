const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bir üyeyi yasaklar')
    .addUserOption(o => o.setName('kullanici').setDescription('Yasaklanacak kişi').setRequired(true))
    .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
    const member = interaction.guild.members.cache.get(user.id);
    if (member && !member.bannable) return interaction.reply({ content: '❌ Bu kişiyi yasaklayamam.', ephemeral: true });
    try {
      await interaction.guild.members.ban(user.id, { reason });
      await interaction.reply(`🔨 ${user.tag} yasaklandı. Sebep: ${reason}`);
    } catch (e) {
      await interaction.reply({ content: `❌ Hata: ${e.message}`, ephemeral: true });
    }
  },
};
