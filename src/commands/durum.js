const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { yerelHazirMi } = require('../ai');
const { getStats } = require('../stats');

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
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
