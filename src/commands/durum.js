const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { yerelHazirMi } = require('../ai');
const { getStats } = require('../stats');
const { effectiveAgent } = require('../ai-models');

const NAMES = { tr: 'durum', en: 'status' };

async function yerelKontrol() {
  const h = await yerelHazirMi();
  if (h.hazir) return { bagli: true, sayi: h.sayi };
  return { bagli: false, neden: h.neden || 'erisilemiyor' };
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'status.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    await interaction.deferReply();
    const yerel = await yerelKontrol();
    const nvidiaKey = Boolean(process.env.NVIDIA_API_KEY);
    let aramaAcik = false;
    try { aramaAcik = require('../arama').aramaAcikMi(); } catch {}
    // Kullanıcının kendi yönetim yetkisi: ret yerse nedenini burada görür.
    let yetkiMetin = '?';
    try { yetkiMetin = require('../ai-perms').yetkiMetni(interaction.user, interaction.member, interaction.guild, L); } catch {}
    // Son yönetim denemesi: takılma noktası teşhisi (sahip/tester görür).
    let sonDeneme = '-';
    try {
      const d = require('../ai-yonetim').sonDenemeAl(interaction.guildId);
      if (d && d.t) {
        const saat = new Date(d.t).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        sonDeneme = `${saat} • ${d.asama}${d.op ? ' • ' + d.op : ''}`;
      }
    } catch {}
    const st = getStats(interaction.client);
    // Yerel kapalıysa SEBEBİ yazılır: adres yok mu, tünel mi kapalı, /local mı kapalı?
    let yerelMetin;
    if (yerel.bagli) {
      yerelMetin = t(L, 'status.local.on', { n: yerel.sayi });
    } else if (yerel.neden === 'adres-yok') {
      yerelMetin = t(L, 'status.local.noaddr');
    } else if (yerel.neden === 'kapali') {
      yerelMetin = t(L, 'status.local.off');
    } else {
      yerelMetin = t(L, 'status.local.unreach');
    }
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'status.title'))
      .setColor(0x5865F2)
      .addFields(
        { name: t(L, 'status.f.ping'), value: st.ping >= 0 ? `${st.ping}ms` : t(L, 'uinfo.unknown'), inline: true },
        { name: t(L, 'status.f.local'), value: yerelMetin, inline: true },
        { name: t(L, 'status.f.nvidia'), value: nvidiaKey ? t(L, 'status.nvidia.on') : t(L, 'status.nvidia.off'), inline: true },
        { name: t(L, 'status.f.uptime'), value: st.uptime, inline: true },
        { name: t(L, 'status.f.agent'), value: effectiveAgent(interaction.guildId).key, inline: true },
        { name: t(L, 'status.f.search'), value: aramaAcik ? t(L, 'status.search.on') : t(L, 'status.search.off'), inline: true },
        { name: t(L, 'status.f.yetki'), value: yetkiMetin, inline: false },
        { name: t(L, 'status.f.sondeneme'), value: sonDeneme, inline: false },
        { name: t(L, 'status.f.kod'), value: st.kod || '?', inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
