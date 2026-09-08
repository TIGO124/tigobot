const { SlashCommandBuilder } = require('discord.js');
const { t, getLang, jokes } = require('../i18n');

const NAMES = { tr: 'espri', en: 'joke' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function satir(x) {
  if (x.k) return `**${x.k}:** ${x.s}`;
  return `*${x.t}*`;
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'joke.desc'));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const liste = jokes(L);
    const espri = liste[Math.floor(Math.random() * liste.length)];
    const satirlar = espri.map(satir);
    const msg = await interaction.reply({ content: satirlar[0], fetchReply: true });
    for (let i = 1; i < satirlar.length; i++) {
      await sleep(i === satirlar.length - 1 ? 1600 : 1100);
      try {
        await msg.edit(satirlar.slice(0, i + 1).join('\n'));
      } catch {
        break;
      }
    }
  }

  return { data, execute };
}

module.exports = { build, _satirlar: L => jokes(L || 'tr').map(e => e.map(satir).join('\n')) };
