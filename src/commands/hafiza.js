const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { clearHistory, historyCount, MAX_TUR } = require('../memory');

const NAMES = { tr: 'hafiza', en: 'memory' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'mem.desc'))
    .addSubcommand(s => s.setName(lang === 'en' ? 'status' : 'durum').setDescription(t(lang, 'mem.sub.status')))
    .addSubcommand(s => s.setName(lang === 'en' ? 'clear' : 'temizle').setDescription(t(lang, 'mem.sub.clear')));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    if (sub === 'clear' || sub === 'temizle') {
      const vardi = clearHistory(interaction.user.id, interaction.guildId);
      return interaction.reply({ content: vardi ? t(L, 'mem.cleared') : t(L, 'mem.alreadyEmpty'), ephemeral: true });
    }
    const n = historyCount(interaction.user.id, interaction.guildId);
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'mem.title'))
      .setColor(0x5865F2)
      .setDescription(t(L, 'mem.body', { n, max: MAX_TUR }))
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return { data, execute };
}

module.exports = { build };
