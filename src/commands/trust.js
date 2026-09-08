const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { liste, guvenEkle, guvenKaldir } = require('../trust');

const NAMES = { tr: 'trust', en: 'trust' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'trust.desc'))
    .addSubcommand(s => s.setName('ekle').setDescription(t(lang, 'trust.sub.add'))
      .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'trust.opt')).setRequired(true)))
    .addSubcommand(s => s.setName('kaldir').setDescription(t(lang, 'trust.sub.remove'))
      .addUserOption(o => o.setName('kullanici').setDescription(t(lang, 'trust.opt.rm')).setRequired(true)))
    .addSubcommand(s => s.setName('liste').setDescription(t(lang, 'trust.sub.list')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: t(L, 'trust.ownerOnly'), ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'liste') {
      const ids = liste(interaction.guildId);
      if (!ids.length) return interaction.reply({ content: t(L, 'trust.empty'), ephemeral: true });
      const adlar = ids.map(id => {
        const m = interaction.guild.members.cache.get(id);
        return m ? m.user.tag : id;
      });
      return interaction.reply({ content: t(L, 'trust.list', { n: adlar.length, adlar: adlar.join('\n') }), ephemeral: true });
    }
    const kisi = interaction.options.getUser('kullanici');
    if (kisi.id === interaction.guild.ownerId) {
      return interaction.reply({ content: t(L, 'trust.isOwner'), ephemeral: true });
    }
    if (kisi.bot) {
      return interaction.reply({ content: t(L, 'trust.isBot'), ephemeral: true });
    }
    if (alt === 'ekle') {
      if (!guvenEkle(interaction.guildId, kisi.id)) {
        return interaction.reply({ content: t(L, 'trust.already', { tag: kisi.tag }), ephemeral: true });
      }
      return interaction.reply({ content: t(L, 'trust.added', { tag: kisi.tag }), ephemeral: true });
    }
    if (!guvenKaldir(interaction.guildId, kisi.id)) {
      return interaction.reply({ content: t(L, 'trust.notIn', { tag: kisi.tag }), ephemeral: true });
    }
    return interaction.reply({ content: t(L, 'trust.removed', { tag: kisi.tag }), ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
