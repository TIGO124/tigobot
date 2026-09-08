const { load, save } = require('./store');

function liste(guildId) {
  if (!guildId) return [];
  const map = load('trust.json', {});
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

// Sunucu sahibi her zaman muaf; listedekiler de muaf.
function guvenilirMi(guildId, userId, sahipMi) {
  if (sahipMi) return true;
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

module.exports = { liste, guvenilirMi, guvenEkle, guvenKaldir };
