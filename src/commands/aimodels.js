const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { allModels, getUserModel, setUserModel, findModel, modelName } = require('../ai-models');
const { acikMi } = require('../local');

const NAMES = { tr: 'aimodels', en: 'aimodels' };

function build(lang) {
  const cmd = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'aim.desc'));
  cmd.addStringOption(o => {
    o.setName('model').setDescription(t(lang, 'aim.opt')).setRequired(false);
    for (const m of allModels()) o.addChoices({ name: modelName(m, lang).slice(0, 100), value: m.key });
    return o;
  });
  const data = cmd;

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const key = interaction.options.getString('model');
    if (!key) {
      const cur = getUserModel(interaction.user.id);
      const satirlar = allModels().map(m =>
        t(L, m.key === cur.key ? 'aim.row' : 'aim.row.off', { n: modelName(m, L) })
      );
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'aim.title'))
        .setDescription(t(L, 'aim.body', { cur: modelName(cur, L), rows: satirlar.join('\n') }))
        .setColor(0x5865F2)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // Model seçimi kişiseldir: herkes kendi modelini seçebilir
    const secilen = findModel(key);
    if (!secilen) {
      return interaction.reply({ content: t(L, 'ai.unknownModel'), ephemeral: true });
    }
    if (secilen.kind === 'local' && !acikMi()) {
      return interaction.reply({ content: t(L, 'aim.localOff'), ephemeral: true });
    }
    const m = setUserModel(interaction.user.id, key);
    if (!m) {
      return interaction.reply({ content: t(L, 'ai.unknownModel'), ephemeral: true });
    }
    await interaction.reply(t(L, 'aim.changed', { m: modelName(m, L) }));
  }

  return { data, execute };
}

module.exports = { build };
