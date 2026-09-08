const { load, save } = require('./store');

function etiket(sayi) {
  return `Toplam Uye: ${sayi}`;
}

async function updateCounter(guild) {
  try {
    const map = load('counter.json', {});
    const chId = map[guild.id];
    if (!chId) return;
    let ch = null;
    try {
      ch = await guild.channels.fetch(chId);
    } catch {
      ch = null;
    }
    if (!ch) {
      delete map[guild.id];
      save('counter.json', map);
      return;
    }
    const yeni = etiket(guild.memberCount);
    if (ch.name !== yeni) await ch.setName(yeni);
  } catch {}
}

module.exports = { updateCounter, etiket };
