// Kullanıcı başına AI token kotası.
// - Limit: AI_TOKEN_LIMIT (varsayılan 16000 token).
// - Aşılırsa AI_BLOCK_MS (varsayılan 6 saat) boyunca kullanılamaz.
// - Blok bitince sayaç sıfırlanır, yeniden başlar.
// Token global kullanıcı bazlıdır (Discord kullanıcı ID'si tektir).
const { load, save } = require('./store');

const DOSYA = 'quota.json';

function limit() {
  const v = parseInt(process.env.AI_TOKEN_LIMIT, 10);
  return v > 0 ? v : 16000;
}
function blockMs() {
  const v = parseInt(process.env.AI_BLOCK_MS, 10);
  return v > 0 ? v : 6 * 60 * 60 * 1000;
}

function oku(userId) {
  const map = load(DOSYA, {});
  const q = map[userId];
  if (!q || typeof q !== 'object') return { tokens: 0, blockedUntil: 0 };
  return {
    tokens: Number(q.tokens) || 0,
    blockedUntil: Number(q.blockedUntil) || 0,
  };
}

function yaz(userId, tokens, blockedUntil) {
  const map = load(DOSYA, {});
  map[userId] = { tokens, blockedUntil };
  // Büyüme koruması
  const keys = Object.keys(map);
  if (keys.length > 20000) {
    for (const k of keys.slice(0, keys.length - 20000)) delete map[k];
  }
  save(DOSYA, map);
}

function reset(userId) {
  yaz(userId, 0, 0);
}

// Kullanıcının şu an bloklu olup olmadığı (süresi dolmuş bloku da temizler).
function isBlocked(userId) {
  const q = oku(userId);
  if (!q.blockedUntil) return false;
  if (q.blockedUntil > Date.now()) return true;
  reset(userId); // süresi doldu -> sıfırla
  return false;
}

// Kullanıcı hâlâ ne kadar üretim yapabilir (token).
function remaining(userId) {
  return Math.max(0, limit() - oku(userId).tokens);
}

// Kalan blok süresi (ms); bloklu değilse 0.
function blockRemainingMs(userId) {
  const q = oku(userId);
  if (!q.blockedUntil) return 0;
  return Math.max(0, q.blockedUntil - Date.now());
}

// Üretimden dönen token sayısını ekle; limit aşılırsa kullanıcıyı blokla.
function addUsage(userId, tokens) {
  const q = oku(userId);
  const toplam = q.tokens + (Number(tokens) || 0);
  let blockedUntil = q.blockedUntil;
  if (toplam >= limit() && !blockedUntil) {
    blockedUntil = Date.now() + blockMs();
  }
  yaz(userId, toplam, blockedUntil);
  return { tokens: toplam, blocked: isBlocked(userId), blockedUntil };
}

// Kota muafiyeti: bot sahibi + sunucu sahibi + trust listesindakiler
// token kotasına TAKILMAZ (blok kontrolü de sayım da atlanır).
// Gerekçe: özel botun çekirdek kullanıcıları test/yönetim yaparken
// 6 saatlik bloklara takılmamalı; kota yalnızca normal kullanıcıları frenler.
function muafMi(user, guildId, guildSahibiMi) {
  try {
    if (user && require('./owner').sahipMi(user)) return true;
  } catch {}
  try {
    if (require('./trust').guvenilirMi(guildId, user && user.id, guildSahibiMi === true)) return true;
  } catch {}
  return false;
}

module.exports = { isBlocked, remaining, blockRemainingMs, addUsage, reset, limit, blockMs, muafMi };