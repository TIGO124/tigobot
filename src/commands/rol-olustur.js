const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'rol-olustur', en: 'create-role' };
const RENKLER = {
  kirmizi: 0xED4245, mavi: 0x5865F2, yesil: 0x57F287,
  sari: 0xFEE75C, mor: 0x9B59B6, turuncu: 0xE67E22, gri: 0x95A5A6,
};
const RENK_ADI = {
  tr: { kirmizi: 'kırmızı', mavi: 'mavi', yesil: 'yeşil', sari: 'sarı', mor: 'mor', turuncu: 'turuncu', gri: 'gri' },
  en: { kirmizi: 'red', mavi: 'blue', yesil: 'green', sari: 'yellow', mor: 'purple', turuncu: 'orange', gri: 'gray' },
};

function build(lang) {
  const etiket = RENK_ADI[lang] || RENK_ADI.tr;
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'mkrole.desc'))
    .addStringOption(o => o.setName('ad').setDescription(t(lang, 'mkrole.opt.name')).setRequired(true))
    .addStringOption(o => {
      o.setName('renk').setDescription(t(lang, 'mkrole.opt.color')).setRequired(false);
      for (const r of Object.keys(RENKLER)) o.addChoices({ name: etiket[r], value: r });
      return o;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const ad = interaction.options.getString('ad');
    const renk = interaction.options.getString('renk');
    try {
      const rol = await interaction.guild.roles.create({
        name: ad,
        color: renk ? RENKLER[renk] : undefined,
        reason: t(L, 'mkrole.by', { u: interaction.user.tag }),
      });
      await interaction.reply(t(L, 'mkrole.done', { r: rol }));
    } catch {
      await interaction.reply({ content: t(L, 'mkrole.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
