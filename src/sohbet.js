// Özel sohbet kanalları kaydı (/sohbet-olustur ile açılan gizli kanallar).
// sohbet.json: { "<channelId>": { guildId, userId, userTag, createdAt } }
// Kanal silinince (komutla ya da elle) kayıt düşülür.
const { load, save } = require('./store');

const DOSYA = 'sohbet.json';

// Mesaj başına disk okumamak için 5 sn'lik bellek önbelleği
// (kaydet/kaldir yazma-geçişli).
let _map = null;
let _ts = 0;
const MAP_TTL_MS = 5000;

function hepsi() {
  try {
    if (_map && Date.now() - _ts < MAP_TTL_MS) return _map;
  } catch {}
  const map = load(DOSYA, {});
  _map = (map && typeof map === 'object') ? map : {};
  _ts = Date.now();
  return _map;
}

function tazele() {
  _ts = Date.now();
}

function kaydet(channelId, bilgi) {
  if (!channelId) return;
  const map = hepsi();
  map[String(channelId)] = {
    guildId: (bilgi && bilgi.guildId) || null,
    userId: (bilgi && bilgi.userId) || null,
    userTag: (bilgi && bilgi.userTag) || null,
    createdAt: (bilgi && bilgi.createdAt) || Date.now(),
  };
  save(DOSYA, map);
  tazele();
}

function kaldir(channelId) {
  if (!channelId) return false;
  const map = hepsi();
  const k = String(channelId);
  if (!map[k]) return false;
  delete map[k];
  save(DOSYA, map);
  tazele();
  return true;
}

// Kanal kayıtlı özel sohbet mi? Varsa kaydını döner.
function bul(channelId) {
  if (!channelId) return null;
  const map = hepsi();
  return map[String(channelId)] || null;
}

function liste(guildId) {
  const map = hepsi();
  return Object.entries(map)
    .filter(([, v]) => !guildId || (v && v.guildId === guildId))
    .map(([channelId, v]) => ({ channelId, ...(v || {}) }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Kullanıcının bu sunucudaki açık sohbet kanalı (varsa ilk kayıt).
function kullanicininKanali(guildId, userId) {
  if (!guildId || !userId) return null;
  const map = hepsi();
  for (const [channelId, v] of Object.entries(map)) {
    if (v && v.guildId === guildId && v.userId === userId) return { channelId, ...v };
  }
  return null;
}

module.exports = { kaydet, kaldir, bul, liste, kullanicininKanali };
