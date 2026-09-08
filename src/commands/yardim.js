const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'yardim', en: 'help' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'help.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const fields = [];
    for (let i = 1; i <= 14; i++) {
      fields.push({ name: t(L, `help.f${i}n`), value: t(L, `help.f${i}v`), inline: true });
    }
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'help.title'))
      .setColor(0x5865F2)
      .setDescription(t(L, 'help.body'))
      .addFields(fields)
      .setFooter({ text: t(L, 'help.footer') })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  return { data, execute };
}

module.exports = { build };
