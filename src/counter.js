const { t, getLang } = require('./i18n');
const { load, save } = require('./store');

// Discord kanal yeniden adlandırma limiti (~10 dk'da 2): arayı aç,
// başarısızlığı sessiz yutma (operatör logda görsün).
const sonAd = new Map(); // guildId -> timestamp
const MIN_SURE_MS = 10 * 60 * 1000;

function etiket(lang, sayi) {
  return t(lang, 'counter.label', { n: sayi });
}

async function updateCounter(guild) {
  try {
    const L = getLang(guild.id);
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
    const yeni = etiket(L, guild.memberCount);
    if (ch.name === yeni) return;
    const son = sonAd.get(guild.id) || 0;
    if (Date.now() - son < MIN_SURE_MS) return; // limit freni
    try {
      await ch.setName(yeni);
      sonAd.set(guild.id, Date.now());
    } catch (e) {
      try { console.warn(`Sayaç adı güncellenemedi (${guild.name}): ${(e && e.message) || e}`); } catch {}
    }
  } catch {}
}

module.exports = { updateCounter, etiket };
