const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserModel } = require('../ai-models');
const { acikMi } = require('../local');

async function yerelKontrol() {
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return { durum: 'AI_BASE_URL ayarlı değil (tünel adresi girilmedi)', modeller: [] };
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { durum: `Ulaşılamıyor (HTTP ${res.status})`, modeller: [] };
    const data = await res.json();
    const adlar = (data.models || []).map(m => m.name);
    return { durum: adlar.length ? 'Bağlı' : 'Bağlı ama model yok', modeller: adlar };
  } catch {
    return { durum: 'Ulaşılamıyor (PC kapalı, Ollama durmuş ya da tünel kopuk olabilir)', modeller: [] };
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
        { name: 'Yerel anahtar', value: acikMi() ? 'Açık' : 'Kapalı (/local kapat ile kapatılmış)' },
        { name: 'Yerel (senin PC)', value: yerel.durum + (yerel.modeller.length ? `\nModeller: ${yerel.modeller.slice(0, 5).join(', ')}` : '') },
        { name: 'NVIDIA', value: nvidiaKey ? 'Key ayarlı' : 'Key ayarlı değil' },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
