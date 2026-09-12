const { load, save } = require('./store');

function liste(guildId) {
  if (!guildId) return [];
  const map = load('trust.json', {});
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

// Bot sahibi (OWNER_ID + ALLOWED_IDS) her sunucuda muaf.
// owner.js'teki username-fallback burada bilerek YOK: ID'siz muafiyet verilmez.
function botSahibiMi(userId) {
  if (!userId) return false;
  if (process.env.OWNER_ID && userId === String(process.env.OWNER_ID).trim()) return true;
  try {
    const extra = String(process.env.ALLOWED_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d{10,}$/.test(s));
    return extra.includes(String(userId));
  } catch {
    return false;
  }
}

// Sunucu sahibi her zaman muaf; listedekiler de muaf.
function guvenilirMi(guildId, userId, sahipMi) {
  if (sahipMi) return true;
  if (botSahibiMi(userId)) return true;
  if (!guildId || !userId) return false;
  return liste(guildId).includes(userId);
}

function guvenEkle(guildId, userId) {
  const map = load('trust.json', {});
  const arr = Array.isArray(map[guildId]) ? map[guildId] : [];
  if (arr.includes(userId)) return false;
  arr.push(userId);
  map[guildId] = arr;
  save('trust.json', map);
  return true;
}

function guvenKaldir(guildId, userId) {
  const map = load('trust.json', {});
  const arr = Array.isArray(map[guildId]) ? map[guildId] : [];
  const idx = arr.indexOf(userId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  map[guildId] = arr;
  save('trust.json', map);
  return true;
}

module.exports = { liste, guvenilirMi, guvenEkle, guvenKaldir, botSahibiMi };
