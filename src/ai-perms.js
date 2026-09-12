// AI yönetim ayarları (aimanage.json).
// - acik: AI yönetim borusu global açık/kapalı (varsayılan true).
// - kim: kimler kullanabilir: 'sahip-sunucu' (varsayılan) | 'yonetici' (ManageGuild) | 'kapali'.
//   Bot sahibi (owner.js) her modda kullanabilir.
// - islemKapali: kapalı işlem anahtarları (varsayılan []).
// - onaysiz: onay İSTEMEYEN yüksek-risk işlemleri (varsayılan [] -> hepsi onay ister).
// - guild: sunucu bazında ezme { gid: { acik?, kim?, logKanal? } }.
//   logKanal: denetim embed'inin gideceği kanal ID'si (yoksa LOG_CHANNEL_ID / isim araması).
const { load, save } = require('./store');
const { sahipMi } = require('./owner');

const DOSYA = 'aimanage.json';
const KIMLER = ['sahip-sunucu', 'yonetici', 'kapali'];

function stateOku() {
  const s = load(DOSYA, {});
  return {
    acik: s.acik !== false,
    kim: KIMLER.includes(s.kim) ? s.kim : 'sahip-sunucu',
    islemKapali: Array.isArray(s.islemKapali) ? s.islemKapali : [],
    onaysiz: Array.isArray(s.onaysiz) ? s.onaysiz : [],
    guild: s.guild && typeof s.guild === 'object' ? s.guild : {},
  };
}

function stateYaz(s) {
  save(DOSYA, s);
  return stateOku();
}

function acikMi(guildId) {
  const s = stateOku();
  if (guildId && s.guild[guildId] && typeof s.guild[guildId].acik === 'boolean') {
    return s.guild[guildId].acik;
  }
  return s.acik;
}

function ayarla(acik) {
  const s = stateOku();
  s.acik = Boolean(acik);
  return stateYaz(s).acik;
}

function getKim(guildId) {
  const s = stateOku();
  if (guildId && s.guild[guildId] && KIMLER.includes(s.guild[guildId].kim)) {
    return s.guild[guildId].kim;
  }
  return s.kim;
}

function setKim(kim) {
  if (!KIMLER.includes(kim)) return null;
  const s = stateOku();
  s.kim = kim;
  stateYaz(s);
  return kim;
}

function setGuild(guildId, patch) {
  if (!guildId) return null;
  const s = stateOku();
  const g = { ...(s.guild[guildId] || {}) };
  if (patch && typeof patch.acik === 'boolean') g.acik = patch.acik;
  if (patch && KIMLER.includes(patch.kim)) g.kim = patch.kim;
  if (patch && typeof patch.logKanal === 'string' && /^\d{10,}$/.test(patch.logKanal)) g.logKanal = patch.logKanal;
  if (patch && patch.logKanal === null) delete g.logKanal;
  if (patch && patch.sifirla === true) {
    delete s.guild[guildId];
  } else {
    s.guild[guildId] = g;
  }
  stateYaz(s);
  return { acik: acikMi(guildId), kim: getKim(guildId), logKanal: getLogKanal(guildId) };
}

function getLogKanal(guildId) {
  if (!guildId) return null;
  const s = stateOku();
  const g = s.guild[guildId];
  return (g && typeof g.logKanal === 'string') ? g.logKanal : null;
}

// İşlem açık mı? (katalogdaki anahtar; bilinmeyen işlem kapalı sayılır)
function isOpEnabled(op, katalog) {
  if (katalog && !katalog[op]) return false;
  return !stateOku().islemKapali.includes(op);
}

function setOpEnabled(op, enabled) {
  const s = stateOku();
  const kapali = new Set(s.islemKapali);
  if (enabled) kapali.delete(op);
  else kapali.add(op);
  s.islemKapali = [...kapali];
  stateYaz(s);
  return enabled;
}

// Yüksek-risk işlem onay ister mi? (varsayılan: ister; onaysiz listesindeyse istemez)
function needsApproval(op) {
  return !stateOku().onaysiz.includes(op);
}

function setApproval(op, istiyor) {
  const s = stateOku();
  const set = new Set(s.onaysiz);
  if (istiyor) set.delete(op);
  else set.add(op);
  s.onaysiz = [...set];
  stateYaz(s);
  return istiyor;
}

// Kullanıcı bu sunucuda AI yönetimi kullanabilir mi? (nedeniyle birlikte)
// /durum içindeki "Yetkin" alanı ve izin kararları bu tek kaynaktan beslenir.
// Döner: { ok: true } ya da { ok: false, neden: '<mg.neden.* anahtarı>' }.
function yetkiDurumu(user, member, guild, lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  let t = (k, v) => k;
  try { ({ t } = require('./i18n')); } catch {}
  if (!guild) return { ok: false, neden: 'dm' };
  if (!user) return { ok: false, neden: 'yetkisiz' };
  if (sahipMi(user)) return { ok: true };
  let gid = null;
  try { gid = guild.id; } catch { return { ok: false, neden: 'hata' }; }
  if (!acikMi(gid)) return { ok: false, neden: 'kullanimKapali' };
  const kim = getKim(gid);
  if (kim === 'kapali') return { ok: false, neden: 'kimKapali' };
  try {
    if (guild.ownerId === user.id) return { ok: true };
    if (kim === 'yonetici' && member && member.permissions && typeof member.permissions.has === 'function' && member.permissions.has('ManageGuild')) {
      return { ok: true };
    }
  } catch {
    return { ok: false, neden: 'hata' };
  }
  if (kim === 'yonetici') return { ok: false, neden: 'izinsiz' };
  return { ok: false, neden: 'sahipDegil' };
}

// /durum'da gösterilen kullanıcıya özel yetki metni.
function yetkiMetni(user, member, guild, lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  const { t } = require('./i18n');
  const d = yetkiDurumu(user, member, guild, lang);
  if (d.ok) return t(L, 'mgmt.ben.ok');
  if (d.neden === 'dm') return t(L, 'mgmt.ben.dm');
  if (d.neden === 'kullanimKapali') return t(L, 'mgmt.ben.kapali');
  let metin = t(L, 'mgmt.ben.yok', { neden: t(L, `mg.neden.${d.neden}`) });
  // Kimlik eşleşmiyorsa sahibine yol göster (ID'ler herkese açık bilgidir).
  if (d.neden === 'sahipDegil' || d.neden === 'izinsiz') {
    metin += '\n' + t(L, 'mgmt.ben.ipucu');
  }
  return metin;
}

// Kullanıcı bu sunucuda AI yönetimi kullanabilir mi?
// user: discord.js User, member: GuildMember (yoksa null), guild: Guild.
function kullanabilirMiYonetim(user, member, guild) {
  try {
    return yetkiDurumu(user, member, guild, 'tr').ok;
  } catch {
    return false;
  }
}

module.exports = {
  KIMLER, stateOku, acikMi, ayarla, getKim, setKim, setGuild, getLogKanal,
  isOpEnabled, setOpEnabled, needsApproval, setApproval, kullanabilirMiYonetim,
  yetkiDurumu, yetkiMetni,
};
