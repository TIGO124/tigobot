const { EmbedBuilder } = require('discord.js');
const { splitText } = require('./ai');

// Cevap embedleri: altta "Model: <ad>" etiketi, yedekse üstte bilgi satırı.
function aiEmbeds(model, text, fallback) {
  const on = fallback ? 'Yerel servise şu anda ulaşılamıyor, yedek model ile cevaplanıyor.\n\n' : '';
  return splitText(on + text, 4000).map(p =>
    new EmbedBuilder()
      .setDescription(p)
      .setColor(0x5865F2)
      .setFooter({ text: `Model: ${model.name}` })
      .setTimestamp()
  );
}

module.exports = { aiEmbeds };
