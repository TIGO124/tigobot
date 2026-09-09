// Sahibin tanımladığı otomatik cevaplar: tetikleyici mesaj -> sabit cevap.
// messageCreate içinde AI akışından ÖNCE kontrol edilir (sabit cevap önceliklidir).
const { load, save } = require('./store');

const DOSYA = 'otocevap.json';
const MAX_TETIK = 200;
const MAX_CEVAP = 1800;

function normalize(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!,;:]+$/u, '').trim();
}

function hepsiniGetir() {
  const m = load(DOSYA, {});
  return m && typeof m === 'object' ? m : {};
}

function ekle(trigger, cevap) {
  const key = normalize(trigger).slice(0, MAX_TETIK);
  if (!key) return false;
  const map = hepsiniGetir();
  map[key] = String(cevap || '').slice(0, MAX_CEVAP);
  save(DOSYA, map);
  return true;
}

function kaldir(trigger) {
  const key = normalize(trigger);
  const map = hepsiniGetir();
  if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
  delete map[key];
  save(DOSYA, map);
  return true;
}

// Mesaj içeriğinden eşleşen otomatik cevabı bulur (yoksa null).
// Bot etiketi/ismi baştan ve sondan temizlenip bakılır.
function bul(content, botId) {
  const map = hepsiniGetir();
  if (!Object.keys(map).length) return null;
  let c = normalize(content).replace(new RegExp(`<@!?${botId}>`, 'g'), ' ');
  c = normalize(c.replace(/^\s*tigobot\b[,.!:\s]*/i, '').replace(/[\s,.!:?]*\btigobot\s*[?.!]*$/i, ''));
  if (c && map[c]) return map[c];
  const raw = normalize(content);
  if (raw && raw !== c && map[raw]) return map[raw];
  return null;
}

module.exports = { normalize, hepsiniGetir, ekle, kaldir, bul, MAX_TETIK, MAX_CEVAP };
