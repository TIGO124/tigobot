const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { enabledModels, getGlobalModel, setGlobalModel, findModel, modelName } = require('../ai-models');
const { acikMi } = require('../local');

const NAMES = { tr: 'aimodels', en: 'aimodels' };

function build(lang) {
  const cmd = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'aim.desc'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  cmd.addStringOption(o => {
    o.setName('model').setDescription(t(lang, 'aim.opt')).setRequired(false);
    for (const m of enabledModels()) o.addChoices({ name: modelName(m, lang).slice(0, 100), value: m.key });
    return o;
  });
  const data = cmd;

  // Global AI modeli: sadece bot sahibi seçer, tüm sunucularda o kullanılır.
  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.noOwner'), ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    const key = interaction.options.getString('model');
    if (!key) {
      const cur = getGlobalModel();
      const satirlar = enabledModels().map(m =>
        t(L, m.key === cur.key ? 'aim.row' : 'aim.row.off', { n: modelName(m, L) })
      );
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'aim.title'))
        .setDescription(t(L, 'aim.body', { cur: modelName(cur, L), rows: satirlar.join('\n') }))
        .setColor(0x5865F2)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const secilen = findModel(key);
    if (!secilen) {
      return interaction.reply({ content: t(L, 'ai.unknownModel'), ephemeral: true });
    }
    if (secilen.kind === 'local' && !acikMi()) {
      return interaction.reply({ content: t(L, 'aim.localOff'), ephemeral: true });
    }
    const m = setGlobalModel(key);
    if (!m) {
      return interaction.reply({ content: t(L, 'ai.unknownModel'), ephemeral: true });
    }
    await interaction.reply(t(L, 'aim.changed', { m: modelName(m, L) }));
  }

  return { data, execute };
}

module.exports = { build };
