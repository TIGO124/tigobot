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

// Kullanıcı bu sunucuda AI yönetimi kullanabilir mi?
// user: discord.js User, member: GuildMember (yoksa null), guild: Guild.
function kullanabilirMiYonetim(user, member, guild) {
  if (!user || !guild) return false;
  if (sahipMi(user)) return true;
  const kim = getKim(guild.id);
  if (kim === 'kapali') return false;
  if (!acikMi(guild.id)) return false;
  try {
    if (guild.ownerId === user.id) return true;
    if (kim === 'yonetici' && member && member.permissions && member.permissions.has('ManageGuild')) return true;
  } catch {}
  return false;
}

module.exports = {
  KIMLER, stateOku, acikMi, ayarla, getKim, setKim, setGuild, getLogKanal,
  isOpEnabled, setOpEnabled, needsApproval, setApproval, kullanabilirMiYonetim,
};
