// Kullanıcı başına sohbet hafızası (son N tur).
// Anahtar: guild varsa "guild:user", DM ise "dm:user".
// JSON dosyada tutulur (aihistory.json), restart'a dayanıklı.
const { load, save } = require('./store');

const DOSYA = 'aihistory.json';
const MAX_TUR = 6; // son 6 soru-cevap (12 mesaj)
const MAX_MSG = 800; // hafızaya atılan tek mesajın kesilme sınırı

function anahtar(userId, guildId) {
  return guildId ? `${guildId}:${userId}` : `dm:${userId}`;
}

function kirp(s) {
  s = String(s || '');
  return s.length > MAX_MSG ? s.slice(0, MAX_MSG) + '…' : s;
}

function getHistory(userId, guildId) {
  const map = load(DOSYA, {});
  const h = map[anahtar(userId, guildId)];
  return Array.isArray(h) ? h : [];
}

// Yeni soru-cevap çiftini ekler, eskileri budar.
function pushHistory(userId, guildId, soru, cevap) {
  try {
    const map = load(DOSYA, {});
    const k = anahtar(userId, guildId);
    const arr = Array.isArray(map[k]) ? map[k] : [];
    arr.push({ role: 'user', content: kirp(soru) });
    arr.push({ role: 'assistant', content: kirp(cevap) });
    map[k] = arr.slice(-MAX_TUR * 2);
    // Büyüme koruması: en fazla 500 konuşma sakla
    const keys = Object.keys(map);
    if (keys.length > 500) {
      for (const kk of keys.slice(0, keys.length - 500)) delete map[kk];
    }
    save(DOSYA, map);
  } catch {}
}

function clearHistory(userId, guildId) {
  const map = load(DOSYA, {});
  const k = anahtar(userId, guildId);
  const vardi = Boolean(map[k] && map[k].length);
  delete map[k];
  save(DOSYA, map);
  return vardi;
}

function historyCount(userId, guildId) {
  return Math.floor(getHistory(userId, guildId).length / 2);
}

module.exports = { getHistory, pushHistory, clearHistory, historyCount, MAX_TUR };
