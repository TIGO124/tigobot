// Sahibin tanımladığı otomatik cevaplar: tetikleyici mesaj -> sabit cevap.
// messageCreate içinde AI akışından ÖNCE kontrol edilir (sabit cevap önceliklidir).
const { load, save } = require('./store');

const DOSYA = 'otocevap.json';
const MAX_TETIK = 200;
const MAX_CEVAP = 1800;

function normalize(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!,;:]+$/u, '').trim();
}

// Mesaj başına disk okumamak için 5 sn'lik bellek önbelleği (ekle/kaldir yazma-geçişli).
let _map = null;
let _ts = 0;
const MAP_TTL_MS = 5000;

function hepsiniGetir() {
  try {
    if (_map && Date.now() - _ts < MAP_TTL_MS) return _map;
  } catch {}
  const m = load(DOSYA, {});
  _map = (m && typeof m === 'object') ? m : {};
  _ts = Date.now();
  return _map;
}

function ekle(trigger, cevap) {
  const key = normalize(trigger).slice(0, MAX_TETIK);
  if (!key) return false;
  const map = hepsiniGetir();
  map[key] = String(cevap || '').slice(0, MAX_CEVAP);
  save(DOSYA, map);
  _ts = Date.now();
  return true;
}

function kaldir(trigger) {
  // ekle() ile aynı dilimleme: uzun tetikleyici silinebilsin.
  const key = normalize(trigger).slice(0, MAX_TETIK);
  const map = hepsiniGetir();
  if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
  delete map[key];
  save(DOSYA, map);
  _ts = Date.now();
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
