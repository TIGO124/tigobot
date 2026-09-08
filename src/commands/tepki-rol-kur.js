const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'tepki-rol-kur', en: 'reaction-role' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'rr.desc'))
    .addRoleOption(o => o.setName('rol').setDescription(t(lang, 'rr.opt.role')).setRequired(true))
    .addStringOption(o => o.setName('baslik').setDescription(t(lang, 'rr.opt.title')).setRequired(false))
    .addStringOption(o => o.setName('aciklama').setDescription(t(lang, 'rr.opt.text')).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const rol = interaction.options.getRole('rol');
    const baslik = interaction.options.getString('baslik') || t(L, 'rr.def.title');
    const aciklama = interaction.options.getString('aciklama') || t(L, 'rr.def.text', { r: rol });
    if (rol.managed) return interaction.reply({ content: t(L, 'rr.managed'), ephemeral: true });
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
    await interaction.reply({ content: t(L, 'rr.done', { r: rol }), ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
