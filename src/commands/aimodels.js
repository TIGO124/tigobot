const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { allModels, getGuildModel, setGuildModel } = require('../ai-models');

module.exports = {
  data: (() => {
    const cmd = new SlashCommandBuilder()
      .setName('aimodels')
      .setDescription('AI modelini gösterir veya değiştirir');
    const opt = cmd.addStringOption(o => {
      o.setName('model').setDescription('Kullanılacak model').setRequired(false);
      for (const m of allModels()) o.addChoices({ name: m.name.slice(0, 100), value: m.key });
      return o;
    });
    return cmd;
  })(),
  async execute(interaction) {
    const key = interaction.options.getString('model');
    if (!key) {
      const cur = getGuildModel(interaction.guildId);
      const satirlar = allModels().map(m =>
        `${m.key === cur.key ? '[aktif]' : '[ ]'} ${m.name} (${m.kind === 'local' ? 'senin bilgisayarın' : 'NVIDIA bulutu'})`
      );
      const embed = new EmbedBuilder()
        .setTitle('AI Modelleri')
        .setDescription(`Aktif model: **${cur.name}**\n\n${satirlar.join('\n')}\n\nDeğiştirmek için: /aimodels model:<ad>`)
        .setColor(0x5865F2)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Modeli sadece sunucuyu yönetenler değiştirebilir. Mevcut modeli görmek için /aimodels yazman yeterli.', ephemeral: true });
    }
    const m = setGuildModel(interaction.guildId, key);
    if (!m) {
      return interaction.reply({ content: 'Bilinmeyen model. Listeyi görmek için /aimodels yaz.', ephemeral: true });
    }
    await interaction.reply(
      `AI modeli değiştirildi: **${m.name}**` +
      (m.kind === 'local' ? ' (bilgisayarındaki Ollama açık ve tünel bağlı olmalı)' : ' (NVIDIA bulutu üzerinden çalışır)')
    );
  },
};
