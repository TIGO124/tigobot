const { SlashCommandBuilder } = require('discord.js');
const { t, getLang, loveComments } = require('../i18n');

const NAMES = { tr: 'ask-olcer', en: 'love-meter' };

function yorum(oran, L) {
  const arr = loveComments(L);
  if (oran >= 90) return arr[0];
  if (oran >= 70) return arr[1];
  if (oran >= 50) return arr[2];
  if (oran >= 30) return arr[3];
  return arr[4];
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'love.desc'))
    .addUserOption(o => o.setName('kisi1').setDescription(t(lang, 'love.opt1')).setRequired(true))
    .addUserOption(o => o.setName('kisi2').setDescription(t(lang, 'love.opt2')).setRequired(false));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const k1 = interaction.options.getUser('kisi1');
    const k2 = interaction.options.getUser('kisi2') || interaction.user;
    const oran = Math.floor(Math.random() * 101);
    await interaction.reply(t(L, 'love.msg', { a: k1, b: k2, n: oran, y: yorum(oran, L) }));
  }

  return { data, execute };
}

module.exports = { build };
