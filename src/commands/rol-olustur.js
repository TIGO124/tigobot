const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const renkler = {
  kirmizi: 0xED4245, mavi: 0x5865F2, yesil: 0x57F287,
  sari: 0xFEE75C, mor: 0x9B59B6, turuncu: 0xE67E22, gri: 0x95A5A6,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rol-olustur')
    .setDescription('Yeni rol oluşturur')
    .addStringOption(o => o.setName('ad').setDescription('Rol adı').setRequired(true))
    .addStringOption(o => o.setName('renk').setDescription('Rol rengi').setRequired(false)
      .addChoices(...Object.keys(renkler).map(r => ({ name: r, value: r }))))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    const ad = interaction.options.getString('ad');
    const renk = interaction.options.getString('renk');
    try {
      const rol = await interaction.guild.roles.create({
        name: ad,
        color: renk ? renkler[renk] : undefined,
        reason: `${interaction.user.tag} tarafından oluşturuldu`,
      });
      await interaction.reply(`Rol oluşturuldu: ${rol}`);
    } catch (e) {
      await interaction.reply({ content: `Rol açılamadı: ${e.message}`, ephemeral: true });
    }
  },
};
