// /yonetim: AI yönetim ayarları (sadece bot sahibi, /local pattern'i).
// - /yonetim durum: mevcut ayar + işlem listesi
// - /yonetim ac | kapat: global anahtar
// - /yonetim kim <sahip-sunucu|yonetici|kapali>: kimler kullanabilir
// - /yonetim islem <ad> <ac|kapat>: işlem bazında
// - /yonetim onay <ad> <ister|istemez>: yüksek-risk işlemde buton onayı
const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const perms = require('../ai-perms');
const { KATALOG } = require('../ai-actions');
const { agentModelleri, setGlobalAgent, setGuildAgent, effectiveAgent } = require('../ai-models');

const NAMES = { tr: 'yonetim', en: 'management' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'mgmt.desc'))
    .addSubcommand(s => s.setName('durum').setDescription(t(lang, 'mgmt.sub.durum')))
    .addSubcommand(s => s.setName('ac').setDescription(t(lang, 'mgmt.sub.ac')))
    .addSubcommand(s => s.setName('kapat').setDescription(t(lang, 'mgmt.sub.kapat')))
    .addSubcommand(s => s.setName('kim').setDescription(t(lang, 'mgmt.sub.kim'))
      .addStringOption(o => o.setName('mod').setDescription(t(lang, 'mgmt.opt.mod')).setRequired(true)
        .addChoices(
          { name: 'sahip-sunucu', value: 'sahip-sunucu' },
          { name: 'yonetici', value: 'yonetici' },
          { name: 'kapali', value: 'kapali' }
        )))
    .addSubcommand(s => s.setName('islem').setDescription(t(lang, 'mgmt.sub.islem'))
      .addStringOption(o => {
        o.setName('ad').setDescription(t(lang, 'mgmt.opt.ad')).setRequired(true);
        for (const k of Object.keys(KATALOG)) o.addChoices({ name: k, value: k });
        return o;
      })
      .addStringOption(o => o.setName('durum').setDescription(t(lang, 'mgmt.opt.durum')).setRequired(true)
        .addChoices({ name: 'ac', value: 'ac' }, { name: 'kapat', value: 'kapat' })))
    .addSubcommand(s => s.setName('onay').setDescription(t(lang, 'mgmt.sub.onay'))
      .addStringOption(o => {
        o.setName('ad').setDescription(t(lang, 'mgmt.opt.ad')).setRequired(true);
        for (const k of Object.keys(KATALOG).filter(k => KATALOG[k].risk === 'yuksek')) o.addChoices({ name: k, value: k });
        return o;
      })
      .addStringOption(o => o.setName('durum').setDescription(t(lang, 'mgmt.opt.onay')).setRequired(true)
        .addChoices({ name: 'ister', value: 'ister' }, { name: 'istemez', value: 'istemez' })))
    .addSubcommand(s => s.setName('ajan').setDescription(t(lang, 'mgmt.sub.ajan'))
      .addStringOption(o => {
        o.setName('model').setDescription(t(lang, 'mgmt.opt.ajan')).setRequired(true);
        for (const m of agentModelleri()) o.addChoices({ name: `${m.key} (${m.kind})`, value: m.key });
        return o;
      }))
    .addSubcommand(s => s.setName('ajansunucu').setDescription(t(lang, 'mgmt.sub.ajansunucu'))
      .addStringOption(o => {
        o.setName('model').setDescription(t(lang, 'mgmt.opt.ajan')).setRequired(true);
        o.addChoices({ name: t(lang, 'mgmt.ajanSifirla'), value: '__sifirla__' });
        for (const m of agentModelleri()) o.addChoices({ name: `${m.key} (${m.kind})`, value: m.key });
        return o;
      }))
    .addSubcommand(s => s.setName('sunucu').setDescription(t(lang, 'mgmt.sub.sunucu'))
      .addStringOption(o => o.setName('durum').setDescription(t(lang, 'mgmt.opt.sunucuDurum')).setRequired(true)
        .addChoices(
          { name: 'ac', value: 'ac' },
          { name: 'kapat', value: 'kapat' },
          { name: t(lang, 'mgmt.ajanSifirla'), value: 'sifirla' }
        ))
      .addStringOption(o => o.setName('kim').setDescription(t(lang, 'mgmt.opt.mod')).setRequired(false)
        .addChoices(
          { name: 'sahip-sunucu', value: 'sahip-sunucu' },
          { name: 'yonetici', value: 'yonetici' },
          { name: 'kapali', value: 'kapali' }
        ))
      .addChannelOption(o => o.setName('log').setDescription(t(lang, 'mgmt.opt.log')).setRequired(false)));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.noOwner'), ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'durum') {
      const s = perms.stateOku();
      const ajan = effectiveAgent(interaction.guildId);
      const satirlar = Object.keys(KATALOG).map(k => {
        const acik = perms.isOpEnabled(k, KATALOG) ? '✓' : '✗';
        const onay = KATALOG[k].risk === 'yuksek' ? (perms.needsApproval(k) ? t(L, 'mgmt.onayVar') : t(L, 'mgmt.onayYok')) : '-';
        return `${acik} ${k} (${KATALOG[k].risk}, ${t(L, 'mgmt.onayKolon')}: ${onay})`;
      });
      return interaction.reply({
        content: t(L, 'mgmt.durum', { acik: s.acik ? t(L, 'mgmt.acik') : t(L, 'mgmt.kapali'), kim: s.kim })
          + '\n' + t(L, 'mgmt.durumAjan', { m: ajan.key })
          + '\n' + t(L, 'mgmt.durumSunucu', {
            acik: perms.acikMi(interaction.guildId) ? t(L, 'mgmt.acik') : t(L, 'mgmt.kapali'),
            kim: perms.getKim(interaction.guildId),
            log: perms.getLogKanal(interaction.guildId) || '-',
          })
          + '\n' + satirlar.join('\n'),
        ephemeral: true,
      });
    }
    if (alt === 'ac') {
      perms.ayarla(true);
      return interaction.reply({ content: t(L, 'mgmt.acildi'), ephemeral: true });
    }
    if (alt === 'kapat') {
      perms.ayarla(false);
      return interaction.reply({ content: t(L, 'mgmt.kapatildi'), ephemeral: true });
    }
    if (alt === 'kim') {
      const kim = perms.setKim(interaction.options.getString('mod'));
      if (!kim) return interaction.reply({ content: t(L, 'err.generic'), ephemeral: true });
      return interaction.reply({ content: t(L, 'mgmt.kimOk', { kim }), ephemeral: true });
    }
    if (alt === 'islem') {
      const ad = interaction.options.getString('ad');
      if (!KATALOG[ad]) return interaction.reply({ content: t(L, 'mgmt.bilinmeyen'), ephemeral: true });
      const acik = interaction.options.getString('durum') === 'ac';
      perms.setOpEnabled(ad, acik);
      return interaction.reply({ content: t(L, 'mgmt.islemOk', { ad, durum: acik ? t(L, 'mgmt.acik') : t(L, 'mgmt.kapali') }), ephemeral: true });
    }
    if (alt === 'onay') {
      const ad = interaction.options.getString('ad');
      if (!KATALOG[ad]) return interaction.reply({ content: t(L, 'mgmt.bilinmeyen'), ephemeral: true });
      const istiyor = interaction.options.getString('durum') === 'ister';
      perms.setApproval(ad, istiyor);
      return interaction.reply({ content: t(L, 'mgmt.onayOk', { ad, durum: istiyor ? t(L, 'mgmt.onayVar') : t(L, 'mgmt.onayYok') }), ephemeral: true });
    }
    if (alt === 'ajan') {
      const m = setGlobalAgent(interaction.options.getString('model'));
      if (!m) return interaction.reply({ content: t(L, 'mgmt.bilinmeyen'), ephemeral: true });
      return interaction.reply({ content: t(L, 'mgmt.ajanOk', { m: m.key }), ephemeral: true });
    }
    if (alt === 'ajansunucu') {
      const secim = interaction.options.getString('model');
      if (secim === '__sifirla__') {
        setGuildAgent(interaction.guildId, null);
        return interaction.reply({ content: t(L, 'mgmt.ajanSifirlandi'), ephemeral: true });
      }
      const m = setGuildAgent(interaction.guildId, secim);
      if (!m) return interaction.reply({ content: t(L, 'mgmt.bilinmeyen'), ephemeral: true });
      return interaction.reply({ content: t(L, 'mgmt.ajanSunucuOk', { m: m.key }), ephemeral: true });
    }
    if (alt === 'sunucu') {
      if (!interaction.guildId) return interaction.reply({ content: t(L, 'err.generic'), ephemeral: true });
      const durum = interaction.options.getString('durum');
      if (durum === 'sifirla') {
        perms.setGuild(interaction.guildId, { sifirla: true });
        return interaction.reply({ content: t(L, 'mgmt.sunucuSifirlandi'), ephemeral: true });
      }
      const patch = { acik: durum === 'ac' };
      const kim = interaction.options.getString('kim');
      if (kim) patch.kim = kim;
      const log = interaction.options.getChannel('log');
      if (log) patch.logKanal = log.id;
      const s = perms.setGuild(interaction.guildId, patch);
      return interaction.reply({ content: t(L, 'mgmt.sunucuOk', { acik: s.acik ? t(L, 'mgmt.acik') : t(L, 'mgmt.kapali'), kim: s.kim }), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
