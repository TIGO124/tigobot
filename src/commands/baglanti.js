const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { runDiag, ozetle } = require('../diag');

const NAMES = { tr: 'baglanti', en: 'connectivity' };

function satir(r) {
  return [
    `DNS: ${ozetle(r.dns)}`,
    `TCP: ${ozetle(r.tcp)}`,
    `HTTPS: ${ozetle(r.https)}`,
    r.auth ? `Auth: ${ozetle(r.auth)}${r.keyUzunluk ? ` (key: ${r.keyUzunluk} krk)` : ''}` : null,
  ].filter(Boolean).join('\n');
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'diag.desc'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.noOwner'), ephemeral: true });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: t(L, 'local.denied'), ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const d = await runDiag();
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'diag.title'))
        .setColor(0x5865F2)
        .addFields(
          { name: 'integrate.api.nvidia.com', value: '```' + satir(d.integrate).slice(0, 900) + '```' },
          { name: 'ai.api.nvidia.com', value: '```' + satir(d.genai).slice(0, 900) + '```' },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply({ content: t(L, 'err.generic') });
    }
  }

  return { data, execute };
}

module.exports = { build };
