const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { ekle, kaldir, hepsiniGetir } = require('../otocevap');
const { clip } = require('../sanitize');

const NAMES = { tr: 'otocevap', en: 'auto-reply' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'oto.desc'))
    .addSubcommand(s => s.setName('ekle').setDescription(t(lang, 'oto.sub.add'))
      .addStringOption(o => o.setName('tetikleyici').setDescription(t(lang, 'oto.opt.t')).setRequired(true))
      .addStringOption(o => o.setName('cevap').setDescription(t(lang, 'oto.opt.c')).setRequired(true)))
    .addSubcommand(s => s.setName('kaldir').setDescription(t(lang, 'oto.sub.remove'))
      .addStringOption(o => o.setName('tetikleyici').setDescription(t(lang, 'oto.opt.rm')).setRequired(true)))
    .addSubcommand(s => s.setName('liste').setDescription(t(lang, 'oto.sub.list')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  // Otomatik cevaplar botun ağzından çıkar: sadece bot sahibi yönetir.
  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.noOwner'), ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'liste') {
      const map = hepsiniGetir();
      const keys = Object.keys(map);
      if (!keys.length) return interaction.reply({ content: t(L, 'oto.empty'), ephemeral: true });
      const rows = keys.slice(0, 20).map(k => `• "${k}" → ${map[k].slice(0, 80)}`).join('\n');
      const devam = keys.length > 20 ? `\n…(+${keys.length - 20})` : '';
      return interaction.reply({ content: t(L, 'oto.list', { n: keys.length, rows: rows + devam }), ephemeral: true });
    }
    const tetik = interaction.options.getString('tetikleyici');
    if (alt === 'ekle') {
      const cevap = interaction.options.getString('cevap');
      if (!ekle(tetik, cevap)) {
        return interaction.reply({ content: t(L, 'err.generic'), ephemeral: true });
      }
      return interaction.reply({ content: t(L, 'oto.added', { t: clip(tetik, 200) }), ephemeral: true });
    }
    if (!kaldir(tetik)) {
      return interaction.reply({ content: t(L, 'oto.notfound', { t: clip(tetik, 200) }), ephemeral: true });
    }
    return interaction.reply({ content: t(L, 'oto.removed', { t: clip(tetik, 200) }), ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
