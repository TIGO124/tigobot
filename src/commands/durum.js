const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserModel } = require('../ai-models');
const { acikMi } = require('../local');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('durum')
    .setDescription('AI servisinin durumunu gösterir (yerel + nvidia)'),
  async execute(interaction) {
    await interaction.deferReply();
    const model = getUserModel(interaction.user.id);
    const yerel = await yerelKontrol();
    const nvidiaKey = Boolean(process.env.NVIDIA_API_KEY);
    const embed = new EmbedBuilder()
      .setTitle('AI Durumu')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Aktif model', value: model.name },
        { name: 'Yerel', value: yerel.bagli ? `✓ Bağlı (${yerel.sayi} model)` : '✗ Kapalı' },
        { name: 'NVIDIA', value: nvidiaKey ? '✓ Aktif' : '✗ Kapalı' },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
