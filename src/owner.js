// Tek sahipli kilit: botu SADECE caglar_007 kullanabilir.
// ID tabanlı kontrol en güvenlisi (kullanıcı adı değişebilir / taklit riski düşük ama var).
// .env içine OWNER_ID yazılırsa ID kontrolü çalışır, yazılmasa bile
// kullanıcı adı "caglar_007" olan hesaba izin verilir.

const SAHIP_KULLANICI_ADI = 'caglar_007';

function normalizeTag(user) {
  if (!user) return '';
  // discord.js User: username = benzersiz handle (örn. caglar_007)
  const u = (user.username || '').toLowerCase();
  return u;
}

function sahipIdler() {
  const out = new Set();
  // Birincil: OWNER_ID
  if (process.env.OWNER_ID && /^\d+$/.test(process.env.OWNER_ID.trim())) {
    out.add(process.env.OWNER_ID.trim());
  }
  // Opsiyonel: birden çok ID -> ALLOWED_IDS=123,456
  const extra = (process.env.ALLOWED_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
  for (const id of extra) out.add(id);
  return out;
}

function sahipMi(user) {
  if (!user) return false;
  // 1) ID eşleşmesi (en güvenli)
  const idler = sahipIdler();
  if (idler.size && idler.has(user.id)) return true;
  // 2) Kullanıcı adı eşleşmesi (ID henüz girilmediyse çalışsın diye)
  //    OWNER_ID doluysa bile yedek olarak kabul edilir.
  if (normalizeTag(user) === SAHIP_KULLANICI_ADI.toLowerCase()) return true;
  return false;
}

function retMesaji(lang) {
  return lang === 'en'
    ? 'This bot is private and can only be used by its owner (caglar_007).'
    : 'Bu bot özeldir, sadece sahibi (caglar_007) kullanabilir.';
}

module.exports = { SAHIP_KULLANICI_ADI, sahipMi, retMesaji };
