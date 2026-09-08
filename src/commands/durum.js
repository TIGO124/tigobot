const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { getUserModel, modelName } = require('../ai-models');
const { acikMi } = require('../local');

const NAMES = { tr: 'durum', en: 'status' };

async function yerelKontrol() {
  if (!acikMi()) return { bagli: false };
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return { bagli: false };
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { bagli: false };
    const data = await res.json();
    const sayi = (data.models || []).length;
    return { bagli: true, sayi };
  } catch {
    return { bagli: false };
  }
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'status.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    await interaction.deferReply();
    const model = getUserModel(interaction.user.id);
    const yerel = await yerelKontrol();
    const nvidiaKey = Boolean(process.env.NVIDIA_API_KEY);
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'status.title'))
      .setColor(0x5865F2)
      .addFields(
        { name: t(L, 'status.f.model'), value: modelName(model, L) },
        { name: t(L, 'status.f.local'), value: yerel.bagli ? t(L, 'status.local.on', { n: yerel.sayi }) : t(L, 'status.local.off') },
        { name: t(L, 'status.f.nvidia'), value: nvidiaKey ? t(L, 'status.nvidia.on') : t(L, 'status.nvidia.off') },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
