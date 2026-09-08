const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tepki-rol-kur')
    .setDescription('Butona basanlara rol veren mesaj kurar')
    .addRoleOption(o => o.setName('rol').setDescription('Verilecek rol').setRequired(true))
    .addStringOption(o => o.setName('baslik').setDescription('Mesaj başlığı').setRequired(false))
    .addStringOption(o => o.setName('aciklama').setDescription('Mesaj açıklaması').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    const rol = interaction.options.getRole('rol');
    const baslik = interaction.options.getString('baslik') || 'Rol Al';
    const aciklama = interaction.options.getString('aciklama') || `Aşağıdaki butona basarak ${rol} rolünü alıp bırakabilirsin.`;

    if (rol.managed) return interaction.reply({ content: 'Bot rolleri tepki-rol olarak verilemez.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(baslik)
      .setDescription(aciklama)
      .setColor(0x57F287)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rr_${rol.id}`)
        .setLabel(rol.name.slice(0, 80))
        .setStyle(ButtonStyle.Success)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `Tepki-rol kuruldu: ${rol}`, ephemeral: true });
  },
};
