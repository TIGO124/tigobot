const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { yerelHazirMi } = require('../ai');
const { getStats } = require('../stats');

const NAMES = { tr: 'durum', en: 'status' };

async function yerelKontrol() {
  const h = await yerelHazirMi();
  return h.hazir ? { bagli: true, sayi: h.sayi } : { bagli: false };
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
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'status.title'))
      .setColor(0x5865F2)
      .addFields(
        { name: t(L, 'status.f.local'), value: yerel.bagli ? t(L, 'status.local.on', { n: yerel.sayi }) : t(L, 'status.local.off'), inline: true },
        { name: t(L, 'status.f.nvidia'), value: nvidiaKey ? t(L, 'status.nvidia.on') : t(L, 'status.nvidia.off'), inline: true },
        { name: t(L, 'status.f.uptime'), value: st.uptime, inline: true },
        { name: t(L, 'status.f.mem'), value: `${st.memHeap} / ${st.memRss}`, inline: true },
        { name: t(L, 'status.f.servers'), value: t(L, 'status.servers', { g: st.guilds, u: st.users }), inline: true },
        { name: t(L, 'status.f.net'), value: t(L, 'status.net', { ping: st.ping >= 0 ? st.ping : '—', node: st.node, cmd: st.commands }), inline: false },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
