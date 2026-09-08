const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'ping', en: 'ping' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'ping.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const sent = await interaction.reply({ content: t(L, 'ping.measuring'), fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(t(L, 'ping.pong', { ms: latency, api: Math.round(interaction.client.ws.ping) }));
  }

  return { data, execute };
}

module.exports = { build };
