const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { liste, ekle, kaldir } = require('../betatester');
const { sahipMi } = require('../owner');

const NAMES = { tr: 'beta-tester', en: 'beta-tester' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'beta.desc'))
    .addSubcommand(s => s.setName('add').setDescription(t(lang, 'beta.sub.add'))
      .addUserOption(o => o.setName('isim').setDescription(t(lang, 'beta.opt')).setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription(t(lang, 'beta.sub.remove'))
      .addUserOption(o => o.setName('isim').setDescription(t(lang, 'beta.opt.rm')).setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription(t(lang, 'beta.sub.list')))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    // Sadece bot sahibi tester ekleyip çıkarabilir.
    let izin = false;
    try { izin = sahipMi(interaction.user); } catch { izin = false; }
    if (!izin) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'list') {
      const ids = liste();
      if (!ids.length) return interaction.reply({ content: t(L, 'beta.empty'), ephemeral: true });
      const adlar = ids.map(id => {
        const m = interaction.guild?.members.cache.get(id);
        return m ? `${m.user.tag} (${id})` : id;
      });
      return interaction.reply({ content: t(L, 'beta.list', { n: adlar.length, adlar: adlar.join('\n') }), ephemeral: true });
    }
    const kisi = interaction.options.getUser('isim');
    if (!kisi) {
      return interaction.reply({ content: t(L, 'err.generic'), ephemeral: true });
    }
    if (kisi.bot) {
      return interaction.reply({ content: t(L, 'trust.isBot'), ephemeral: true });
    }
    if (alt === 'add') {
      if (!ekle(kisi.id)) {
        return interaction.reply({ content: t(L, 'beta.already', { tag: kisi.tag }), ephemeral: true });
      }
      return interaction.reply({ content: t(L, 'beta.added', { tag: kisi.tag }), ephemeral: true });
    }
    if (!kaldir(kisi.id)) {
      return interaction.reply({ content: t(L, 'beta.notIn', { tag: kisi.tag }), ephemeral: true });
    }
    return interaction.reply({ content: t(L, 'beta.removed', { tag: kisi.tag }), ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
