// AI yönetim işlem kataloğu (FAZ 1: tam kapsam, sadece yerel 9B ajanomentari kullanır).
// - Her işlem: { key, risk: 'dusuk'|'yuksek', tool (Ollama tools şeması), run(ctx, args) }.
// - run() sonucu: { ok:true, text } ya da { ok:false, text } (kullanıcıya gösterilir).
// - Güvenlik: whitelist dışı op çalışmaz; hiyerarşi/bot/sahip kontrolleri run() içinde.
// - ctx: { guild, channel, member (isteyen), user, lang, client }.
const { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const { t } = require('./i18n');
const { clip, pingKir } = require('./sanitize');
const { anketEmbed } = require('./commands/anket');
const { load, save } = require('./store');

// Rol düzenleme için Türkçe izin adı -> Discord bayrağı.
// 'yönetici' bilerek YASAK_IZIN'dedir (AI yoluyla Administrator dağıtılamaz).
const IZIN_ADLARI = {
  'kanalları yönet': 'ManageChannels', 'kanallari yonet': 'ManageChannels', 'kanal yönet': 'ManageChannels', 'kanal yonet': 'ManageChannels',
  'rolleri yönet': 'ManageRoles', 'rolleri yonet': 'ManageRoles', 'rol yönet': 'ManageRoles', 'rol yonet': 'ManageRoles',
  'üye at': 'KickMembers', 'uye at': 'KickMembers', 'at': 'KickMembers', 'kick': 'KickMembers',
  'yasakla': 'BanMembers', 'ban': 'BanMembers',
  'sustur': 'ModerateMembers', 'timeout': 'ModerateMembers', 'mute': 'ModerateMembers',
  'mesajları yönet': 'ManageMessages', 'mesajlari yonet': 'ManageMessages',
  'mesaj gönder': 'SendMessages', 'mesaj gonder': 'SendMessages',
  'bağlan': 'Connect', 'baglan': 'Connect', 'connect': 'Connect',
  'konuş': 'Speak', 'konus': 'Speak', 'speak': 'Speak',
  'tepki ekle': 'AddReactions', 'tepki': 'AddReactions',
  'emoji yönet': 'ManageEmojisAndStickers', 'emoji yonet': 'ManageEmojisAndStickers',
  'görüntüle': 'ViewChannel', 'goruntule': 'ViewChannel', 'gör': 'ViewChannel',
  'geçmişi oku': 'ReadMessageHistory', 'gecmisi oku': 'ReadMessageHistory',
  'yönetici': 'Administrator', 'yonetici': 'Administrator', 'admin': 'Administrator', 'administrator': 'Administrator',
};
const YASAK_IZIN = new Set(['Administrator']);

// Kanal izni için kısa ad -> bayrak listesi.
const KANAL_IZIN = {
  'görüntüle': ['ViewChannel'], 'goruntule': ['ViewChannel'], 'gör': ['ViewChannel'],
  'yaz': ['SendMessages', 'ReadMessageHistory'], 'yazma': ['SendMessages', 'ReadMessageHistory'],
  'bağlan': ['Connect'], 'baglan': ['Connect'],
  'hepsi': ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect'],
};

// İsteyen kontrolü: bot sahibi / sunucu sahibi her zaman geçer;
// diğerleri için Discord yetkisi aranır (bot yetkisi yetmez).
function isteyenBotSahibi(ctx) {
  try { return require('./owner').sahipMi(ctx && ctx.user); } catch { return false; }
}
function isteyenSunucuSahibi(ctx) {
  try { return Boolean(ctx && ctx.guild && ctx.user && ctx.guild.ownerId === ctx.user.id); } catch { return false; }
}
function isteyenIzni(ctx, perm) {
  if (!ctx || !ctx.guild) return false;
  if (isteyenBotSahibi(ctx) || isteyenSunucuSahibi(ctx)) return true;
  try {
    return Boolean(ctx.member && ctx.member.permissions && typeof ctx.member.permissions.has === 'function' && ctx.member.permissions.has(perm));
  } catch { return false; }
}
// Discord API hatasını kullanıcı diline çevir (her şey "yetkiYok" değil).
// 429: hız limiti, 30003: pin dolu, 30008: emoji dolu, 50001/50013: yetki.
function discordHata(e, L, varsayilan) {
  try {
    const code = e && (typeof e.code === 'number' ? e.code : (e.rawError && e.rawError.code));
    const status = e && e.status;
    if (code === 429 || status === 429) return t(L, 'mg.rateLimit');
    if (code === 30003) return t(L, 'mg.pinDolu');
    if (code === 30008) return t(L, 'mg.emojiDolu');
    if (code === 50013 || code === 50001) return t(L, 'mg.yetkiYok');
  } catch {}
  return varsayilan || t(L, 'mg.yetkiYok');
}
const bekle = ms => new Promise(r => setTimeout(r, ms));

// Üye hedefli işlemlerde isteyenin rolü hedeften üstte olmalı.
function isteyenUyeUstu(ctx, hedef, L) {
  if (isteyenBotSahibi(ctx) || isteyenSunucuSahibi(ctx)) return null;
  try {
    const ust = ctx.member && ctx.member.roles && ctx.member.roles.highest;
    const alt = hedef && hedef.roles && hedef.roles.highest;
    if (!ust || !alt || ust.comparePositionTo(alt) <= 0) return { ok: false, text: t(L, 'mg.hiyerarsi') };
  } catch {
    return { ok: false, text: t(L, 'mg.yetkiYok') };
  }
  return null;
}

// Rol işlemlerinde isteyenin en yüksek rolü hedeften üstte olmalı.
function isteyenRolUstu(ctx, rol, L) {
  if (isteyenBotSahibi(ctx) || isteyenSunucuSahibi(ctx)) return null;
  try {
    const ust = ctx.member && ctx.member.roles && ctx.member.roles.highest;
    if (!ust || ust.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
  } catch {
    return { ok: false, text: t(L, 'mg.yetkiYok') };
  }
  return null;
}

function temizAd(s, max = 100) {
  return clip(String(s || '').trim(), max);
}

// Discord kanal slug: kullanıcının yazımını korur (Türkçe karakter, alt çizgi korunur).
// Sadece Discord'un istemedikleri düzeltilir: küçük harf, boşluk->tire, yasak karakter atılır.
function kanalSlug(s) {
  let ad = String(s || '').trim().toLocaleLowerCase('tr');
  ad = ad.replace(/\s+/g, '-');
  ad = ad.replace(/[^\p{L}\p{N}\-_]/gu, '');
  ad = ad.replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return clip(ad, 100);
}

// --- Hedef çözümleyiciler (mention / ID / isim) ---
// ID/mention önce önbellekte aranır, yoksa API'den çekilir
// (kalabalık sunucularda çevrimdışı üyeler önbellekte olmayabilir).
async function uyeCoz(guild, str) {
  if (!guild || !str) return null;
  const s = String(str).trim();
  let id = null;
  const men = s.match(/^<@!?(\d+)>$/);
  if (men) id = men[1];
  else if (/^\d+$/.test(s)) id = s;
  if (id) {
    try {
      const m = guild.members.cache.get(id);
      if (m) return m;
    } catch {}
    try {
      const m = await guild.members.fetch(id);
      if (m) return m;
    } catch {}
    return null;
  }
  const k = s.toLowerCase().replace(/^@/, '');
  try {
    // Önce tam eşleşme: "ali" varken "alican"a vurma (includes fallback en son).
    const tum = [...guild.members.cache.values()];
    const tam = tum.find(m =>
      (m.user.username || '').toLowerCase() === k ||
      (m.displayName || '').toLowerCase() === k
    );
    if (tam) return tam;
    const bul = guild.members.cache.find(m =>
      (m.user.username || '').toLowerCase().includes(k) ||
      (m.displayName || '').toLowerCase().includes(k)
    );
    return bul || null;
  } catch { return null; }
}

function rolCoz(guild, str) {
  if (!guild || !str) return null;
  const s = String(str).trim();
  let id = null;
  const men = s.match(/^<@&(\d+)>$/);
  if (men) id = men[1];
  else if (/^\d+$/.test(s)) id = s;
  try {
    if (id) {
      const r = guild.roles.cache.get(id);
      if (r) return r;
    }
    const k = s.toLowerCase().replace(/^@/, '');
    const tam = guild.roles.cache.find(r => r.name.toLowerCase() === k);
    if (tam) return tam;
    return guild.roles.cache.find(r =>
      r.name.toLowerCase().includes(k)
    ) || null;
  } catch { return null; }
}

function kanalCoz(guild, str) {
  if (!guild || !str) return null;
  const s = String(str).trim();
  let id = null;
  const men = s.match(/^<#(\d+)>$/);
  if (men) id = men[1];
  else if (/^\d+$/.test(s)) id = s;
  try {
    if (id) {
      const c = guild.channels.cache.get(id);
      if (c) return c;
    }
    const k = s.toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    const tam = guild.channels.cache.find(c => (c.name || '').toLowerCase() === k);
    if (tam) return tam;
    return guild.channels.cache.find(c =>
      (c.name || '').toLowerCase().includes(k)
    ) || null;
  } catch { return null; }
}

function botUstu(guild) {
  try { return guild.members.me; } catch { return null; }
}

// Moderasyon hedefi güvenli mi? (bot ve sunucu sahibi korunur)
function hedefGuvenli(guild, hedef, L) {
  if (!hedef) return { ok: false, text: t(L, 'mg.hedefYok') };
  if (hedef.user.bot) return { ok: false, text: t(L, 'mg.hedefBot') };
  try {
    if (guild.ownerId === hedef.id) return { ok: false, text: t(L, 'mg.hedefSahip') };
  } catch {}
  return { ok: true };
}

// Son açılan kategori (lonca başına): "o grubun altına X aç" gibi göndermeler
// en son oluşturulan kategoriye çözülür. 30 dk sonra bayatlar.
const sonKategoriler = new Map();
const SON_KATEGORI_MS = 30 * 60 * 1000;
function sonKategoriKaydet(guildId, kat) {
  try {
    if (!guildId || !kat) return;
    sonKategoriler.set(guildId, { id: kat.id, ad: kat.name, t: Date.now() });
    if (sonKategoriler.size > 200) sonKategoriler.delete(sonKategoriler.keys().next().value);
  } catch {}
}
function sonKategoriAl(guildId) {
  try {
    const k = sonKategoriler.get(guildId);
    if (!k) return null;
    if (Date.now() - k.t > SON_KATEGORI_MS) { sonKategoriler.delete(guildId); return null; }
    return k;
  } catch { return null; }
}

// Üst kategori çözümleme: ad -> kategori kanalı (değilse null).
function kategoriCoz(guild, str) {
  const c = kanalCoz(guild, str);
  try {
    if (c && c.type === ChannelType.GuildCategory) return c;
  } catch {}
  return null;
}

const KATALOG = {
  kanal_ac: {
    risk: 'dusuk',
    tool: { name: 'kanal_ac', description: 'Sunucuda metin veya ses kanalı açar/oluşturur/ekler. Kullanıcı kanal, oda, chat, sohbet odası derse bu araç. ebeveyn verilirse kanal o kategori/grubun altına açılır.', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Kanal adı' }, tur: { type: 'string', enum: ['metin', 'ses'], description: 'Kanal türü' }, ebeveyn: { type: 'string', description: 'Üst kategori/grup adı (boşsa en üstte açılır)' } }, required: ['ad', 'tur'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const ad = kanalSlug(a.ad);
      if (!ad) return { ok: false, text: t(L, 'mg.adYok') };
      if (!['metin', 'ses'].includes(a.tur)) return { ok: false, text: t(L, 'mg.turYok') };
      let parent = null;
      const eb = temizAd(a.ebeveyn, 90);
      if (eb) {
        const kat = kategoriCoz(ctx.guild, eb) || kategoriCoz(ctx.guild, eb.toLocaleLowerCase('tr'));
        if (kat) parent = kat.id;
      }
      try {
        const kanal = await ctx.guild.channels.create({
          name: ad,
          type: a.tur === 'ses' ? ChannelType.GuildVoice : ChannelType.GuildText,
          ...(parent ? { parent } : {}),
          reason: `AI yönetim (${ctx.user.tag})`,
        });
        return { ok: true, text: t(L, 'mg.kanalAcildi', { ch: kanal }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kanal_sil: {
    risk: 'yuksek',
    tool: { name: 'kanal_sil', description: 'Sunucudaki bir metin/ses KANALINI/odayı SİLER/kaldırır. Sadece kullanıcı açıkça kanal/oda sil derse kullan. Kullanıcı grup/kategori/bölüm sil derse BUNU DEĞİL kategori_sil kullan.', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Silinecek kanal/oda adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kanal = kanalCoz(ctx.guild, a.ad);
      if (!kanal) return { ok: false, text: t(L, 'mg.kanalYok') };
      // Kategori, kanal_sil ile silinemez (kategori_sil'e yönlendirir, alt kanallar korunur).
      try {
        if (kanal.type === ChannelType.GuildCategory) return { ok: false, text: t(L, 'mg.kanalYok') };
      } catch {}
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      try {
        const ad = String(kanal.name || '');
        await kanal.delete(`AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.kanalSilindi', { ad }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kategori_sil: {
    risk: 'yuksek',
    tool: { name: 'kategori_sil', description: 'Sunucudaki bir KATEGORİYİ/grubu/bölümü SİLER/kaldırır. Kullanıcı grup/kategori/bölüm sil derse BU araç (kanal_sil değil). Onay sonrası çalışır; altındaki kanallar silinmez, kategorisiz kalır.', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Silinecek kategori/grup adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kat = kategoriCoz(ctx.guild, a.ad)
        || kategoriCoz(ctx.guild, temizAd(a.ad, 90).toLocaleLowerCase('tr'));
      if (!kat) {
        // Aynı adda kanal varsa yol göster
        try {
          const kn = kanalCoz(ctx.guild, a.ad);
          if (kn) return { ok: false, text: t(L, 'mg.kanalBelki', { ad: kn.name }) };
        } catch {}
        return { ok: false, text: t(L, 'mg.kategoriYok') };
      }
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      let cocuk = 0;
      try {
        cocuk = ctx.guild.channels.cache.filter(c => c.parentId === kat.id).size || 0;
      } catch { cocuk = 0; }
      try {
        const ad = String(kat.name || '');
        await kat.delete(`AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.kategoriSilindi', { ad }) + (cocuk > 0 ? ' ' + t(L, 'mg.kategoriSilindiNot', { n: cocuk }) : '') };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kategori_ac: {
    risk: 'dusuk',
    tool: { name: 'kategori_ac', description: 'Sunucuda kategori/grup açar/oluşturur/ekler. Kullanıcı grup, kategori, bölüm derse BU araç (kanal_ac değil).', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Kategori/grup adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const ad = temizAd(a.ad, 90);
      if (!ad) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const kat = await ctx.guild.channels.create({ name: ad, type: ChannelType.GuildCategory, reason: `AI yönetim (${ctx.user.tag})` });
        try { sonKategoriKaydet(ctx.guild && ctx.guild.id, kat); } catch {}
        return { ok: true, text: t(L, 'mg.kategoriAcildi', { ad: kat.name }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_olustur: {
    risk: 'dusuk',
    tool: { name: 'rol_olustur', description: 'Sunucuda yeni rol/rütbe oluşturur/ekler. renk: #ff0000 gibi hex (boşsa renksiz).', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Rol adı' }, renk: { type: 'string', description: '#rrggbb hex renk (boşsa renksiz)' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const ad = temizAd(a.ad, 90);
      if (!ad) return { ok: false, text: t(L, 'mg.adYok') };
      let color = undefined;
      if (a.renk) {
        const m = String(a.renk).trim().match(/^#?([0-9a-f]{6})$/i);
        if (m) color = parseInt(m[1], 16);
      }
      try {
        const rol = await ctx.guild.roles.create({ name: ad, ...(color !== undefined ? { color } : {}), reason: `AI yönetim (${ctx.user.tag})` });
        return { ok: true, text: t(L, 'mg.rolOlusu', { r: rol }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_ver: {
    risk: 'yuksek',
    tool: { name: 'rol_ver', description: 'Bir kullanıcıya/kullanıcıya rol/rütbe verir/ekler/tanımlar.', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, rol: { type: 'string', description: 'Rol adı' } }, required: ['hedef', 'rol'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      const rol = rolCoz(ctx.guild, a.rol);
      if (!rol) return { ok: false, text: t(L, 'mg.rolYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageRoles)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsi = isteyenRolUstu(ctx, rol, L);
      if (hiyerarsi) return hiyerarsi;
      const ben = botUstu(ctx.guild);
      try {
        if (!ben || ben.roles.highest.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
        await hedef.roles.add(rol, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.rolVerildi', { u: hedef.user.tag, r: rol.name }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_al: {
    risk: 'yuksek',
    tool: { name: 'rol_al', description: 'Bir kullanıcıdan rol/rütbe alır/kaldırır/söker.', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, rol: { type: 'string', description: 'Rol adı' } }, required: ['hedef', 'rol'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      const rol = rolCoz(ctx.guild, a.rol);
      if (!rol) return { ok: false, text: t(L, 'mg.rolYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageRoles)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsi = isteyenRolUstu(ctx, rol, L);
      if (hiyerarsi) return hiyerarsi;
      const ben = botUstu(ctx.guild);
      try {
        if (!ben || ben.roles.highest.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
        await hedef.roles.remove(rol, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.rolAlindi', { u: hedef.user.tag, r: rol.name }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  timeout: {
    risk: 'yuksek',
    tool: { name: 'timeout', description: 'Bir üyeyi susturur/mute/timeout atar (konuşamaz).', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, sure: { type: 'integer', description: 'Dakika (1-40320)' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedef', 'sure'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      const hamSure = parseInt(a.sure, 10);
      if (!Number.isFinite(hamSure) || hamSure < 1) return { ok: false, text: t(L, 'mg.sureYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ModerateMembers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
      if (hiyerarsiUye) return hiyerarsiUye;
      const dk = Math.min(40320, hamSure);
      if (!hedef.moderatable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.timeout(dk * 60 * 1000, `AI yönetim (${ctx.user.tag}): ${sebep}`);
        return { ok: true, text: t(L, 'mg.timeoutOk', { u: hedef.user.tag, dk }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kick: {
    risk: 'yuksek',
    tool: { name: 'kick', description: 'Bir üyeyi sunucudan ATAR/kovar/çıkarır. Sadece kullanıcı açıkça at/kov derse kullan.', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedef'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      if (!isteyenIzni(ctx, PermissionFlagsBits.KickMembers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
      if (hiyerarsiUye) return hiyerarsiUye;
      if (!hedef.kickable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.kick(`AI yönetim (${ctx.user.tag}): ${sebep}`);
        return { ok: true, text: t(L, 'mg.kickOk', { u: hedef.user.tag }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  ban: {
    risk: 'yuksek',
    tool: { name: 'ban', description: 'Bir üyeyi sunucudan YASAKLAR/banlar/engeller. Sadece kullanıcı açıkça yasakla/banla derse kullan.', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedef'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      if (!isteyenIzni(ctx, PermissionFlagsBits.BanMembers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
      if (hiyerarsiUye) return hiyerarsiUye;
      if (!hedef.bannable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.ban({ reason: `AI yönetim (${ctx.user.tag}): ${sebep}` });
        return { ok: true, text: t(L, 'mg.banOk', { u: hedef.user.tag }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  uyari: {
    risk: 'dusuk',
    tool: { name: 'uyari', description: 'Bir üyeyi uyarır/ikaz eder (DM + kanala bilgi).', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı veya etiketi' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedef'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
      try { await hedef.send(t(L, 'warn.dm', { g: ctx.guild.name, r: sebep })).catch(() => {}); } catch {}
      return { ok: true, text: t(L, 'mg.uyariOk', { u: hedef.user.tag, r: sebep }) };
    },
  },
  mesaj_sil: {
    risk: 'yuksek',
    tool: { name: 'mesaj_sil', description: 'Bulunulan kanaldan son mesajları toplu siler/temizler.', parameters: { type: 'object', properties: { sayi: { type: 'integer', description: 'Adet (1-100)' } }, required: ['sayi'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hamSayi = parseInt(a.sayi, 10);
      if (!Number.isFinite(hamSayi) || hamSayi < 1) return { ok: false, text: t(L, 'mg.sayiYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageMessages)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const sayi = Math.min(100, hamSayi);
      try {
        const silinen = await ctx.channel.bulkDelete(sayi, true);
        return { ok: true, text: t(L, 'mg.silOk', { n: silinen.size }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  sayac_kur: {
    risk: 'dusuk',
    tool: { name: 'sayac_kur', description: 'Üye sayısını/sayacını gösteren ses kanalı açar/kurar.', parameters: { type: 'object', properties: {}, required: [] } },
    async run(ctx) {
      const L = ctx.lang;
      try {
        // İki dilin etiketi de tanınır (TR "Toplam", EN "Total Members"):
        // yoksa dil değişmiş sunucularda kopya sayaç açılırdı.
        const varOlan = ctx.guild.channels.cache.find(c =>
          c.type === ChannelType.GuildVoice && /^(toplam|total members)/i.test((c.name || '').trim())
        );
        if (varOlan) return { ok: true, text: t(L, 'counter.exists', { ch: varOlan }) };
        const kanal = await ctx.guild.channels.create({
          name: `Toplam Uye: ${ctx.guild.memberCount}`,
          type: ChannelType.GuildVoice,
          reason: `AI yönetim (${ctx.user.tag})`,
        });
        return { ok: true, text: t(L, 'counter.done', { ch: kanal }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  anket_baslat: {
    risk: 'dusuk',
    tool: { name: 'anket_baslat', description: 'Butonlu anket/oylama başlatır/açar (2-4 seçenek).', parameters: { type: 'object', properties: { soru: { type: 'string', description: 'Anket sorusu' }, secenekler: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: '2-4 seçenek' } }, required: ['soru', 'secenekler'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const soru = temizAd(a.soru, 240);
      const sec = (Array.isArray(a.secenekler) ? a.secenekler : []).map(s => temizAd(s, 75)).filter(Boolean).slice(0, 4);
      if (!soru || sec.length < 2) return { ok: false, text: t(L, 'mg.anketYok') };
      try {
        const pollId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const row = new ActionRowBuilder().addComponents(
          sec.map((s, i) => new ButtonBuilder().setCustomId(`anket_${pollId}_${i}`).setLabel(`${i + 1}. ${s}`.slice(0, 80)).setStyle(ButtonStyle.Primary))
        );
        const msg = await ctx.channel.send({ embeds: [anketEmbed(soru, sec, sec.map(() => 0), L)], components: [row] });
        const polls = load('ankets.json', {});
        polls[pollId] = { messageId: msg.id, channelId: msg.channelId, guildId: ctx.guild.id, soru, secenekler: sec, counts: sec.map(() => 0), voters: {} };
        const keys = Object.keys(polls);
        if (keys.length > 50) {
          for (const k of keys.slice(0, keys.length - 50)) delete polls[k];
        }
        save('ankets.json', polls);
        return { ok: true, text: t(L, 'mg.anketOk') };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  hatirlatici_kur: {
    risk: 'dusuk',
    tool: { name: 'hatirlatici_kur', description: 'Belirtilen süre sonra hatırlatma/hatırlatıcı/alarm gönderir/kurar.', parameters: { type: 'object', properties: { sure: { type: 'integer', description: 'Dakika (1-10080)' }, mesaj: { type: 'string', description: 'Hatırlatma metni' } }, required: ['sure', 'mesaj'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hamDk = parseInt(a.sure, 10);
      if (!Number.isFinite(hamDk) || hamDk < 1) return { ok: false, text: t(L, 'mg.hatirlaticiYok') };
      const dk = Math.min(10080, hamDk);
      const mesaj = temizAd(a.mesaj, 1500);
      if (!mesaj) return { ok: false, text: t(L, 'mg.hatirlaticiYok') };
      // Kalıcı kayıt: restart/deploy'da buharlaşmasın (açılışta restore edilir).
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const kayit = {
        guildId: (ctx.guild && ctx.guild.id) || null,
        channelId: (ctx.channel && ctx.channel.id) || null,
        userId: (ctx.user && ctx.user.id) || null,
        userTag: (ctx.user && ctx.user.tag) || null,
        mesaj, fireAt: Date.now() + dk * 60 * 1000, lang: L,
      };
      try {
        const m = hatirlaticiOku();
        m[id] = kayit;
        // Büyüme koruması: en fazla 200 bekleyen
        const keys = Object.keys(m);
        if (keys.length > 200) {
          for (const k of keys.slice(0, keys.length - 200)) delete m[k];
        }
        hatirlaticiYaz(m);
      } catch {}
      try {
        const client = ctx.client || (ctx.channel && ctx.channel.client) || null;
        planlaHatirlatici(client, { id, ...kayit });
      } catch {}
      const kim = ctx.user;
      return { ok: true, text: t(L, 'rem.ok', { u: kim, dk, m: mesaj }) };
    },
  },
  kanal_duzenle: {
    risk: 'dusuk',
    tool: { name: 'kanal_duzenle', description: 'Var olan bir kanalın adını, konusunu (topic), yavaş modunu, NSFW ayarını değiştirir veya başka kategoriye taşır. Örn: "genel kanalının adını duyuru yap, konusunu kurallar yaz".', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Düzenlenecek kanalın adı' }, yeniAd: { type: 'string', description: 'Yeni kanal adı (boşsa değişmez)' }, konu: { type: 'string', description: 'Yeni kanal konusu (boşsa değişmez)' }, yavasMod: { type: 'integer', description: 'Yavaş mod saniyesi 0-21600 (0=kapalı)' }, nsfw: { type: 'boolean', description: 'NSFW aç/kapa' }, ebeveyn: { type: 'string', description: 'Taşınacak kategori/grup adı (boşsa taşınmaz)' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kanal = kanalCoz(ctx.guild, a.ad);
      if (!kanal) return { ok: false, text: t(L, 'mg.kanalYok') };
      try {
        if (kanal.type === ChannelType.GuildCategory) return { ok: false, text: t(L, 'mg.kanalYok') };
      } catch {}
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const yama = {};
      if (a.yeniAd) {
        const ad = kanalSlug(a.yeniAd);
        if (ad) yama.name = ad;
      }
      if (a.konu !== undefined && a.konu !== null && String(a.konu).trim() !== '') yama.topic = clip(String(a.konu), 1024);
      if (a.yavasMod !== undefined && a.yavasMod !== null && a.yavasMod !== '') {
        const sn = parseInt(a.yavasMod, 10);
        if (!Number.isFinite(sn) || sn < 0) return { ok: false, text: t(L, 'mg.sayiYok') };
        yama.rateLimitPerUser = Math.min(21600, sn);
      }
      if (typeof a.nsfw === 'boolean') yama.nsfw = a.nsfw;
      if (a.ebeveyn) {
        const eb = temizAd(a.ebeveyn, 90);
        const kat = kategoriCoz(ctx.guild, eb) || kategoriCoz(ctx.guild, eb.toLocaleLowerCase('tr'));
        if (!kat) return { ok: false, text: t(L, 'mg.kategoriYok') };
        yama.parent = kat.id;
      }
      if (!Object.keys(yama).length) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const guncel = await kanal.edit(yama, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.kanalDuzenlendi', { ad: pingKir(guncel.name) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kanal_izin: {
    risk: 'yuksek',
    tool: { name: 'kanal_izin', description: 'Bir kanalda role/kullanıcıya izin açar veya kapatır (özel kanal kurmanın yolu). izin: görüntüle (kanalı görme), yaz (mesaj yazma), baglan (sese bağlanma), hepsi. durum: ac (izin ver) veya kapat (yasakla). Örn: "duyuru kanalında üyelere yazmayı kapat".', parameters: { type: 'object', properties: { kanal: { type: 'string', description: 'Kanal adı' }, hedef: { type: 'string', description: 'Rol veya kullanıcı adı' }, izin: { type: 'string', description: 'görüntüle, yaz, baglan, hepsi' }, durum: { type: 'string', description: 'ac veya kapat' } }, required: ['kanal', 'hedef', 'izin', 'durum'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kanal = kanalCoz(ctx.guild, a.kanal);
      if (!kanal) {
        // Aynı adda kategori varsa yol göster (kullanıcı tipi karıştırmış olabilir)
        try {
          const kat = kategoriCoz(ctx.guild, a.kanal) || kategoriCoz(ctx.guild, temizAd(a.kanal, 90).toLocaleLowerCase('tr'));
          if (kat) return { ok: false, text: t(L, 'mg.kategoriBelki', { ad: kat.name }) };
        } catch {}
        return { ok: false, text: t(L, 'mg.kanalYok') };
      }
      try {
        if (kanal.type === ChannelType.GuildCategory) return { ok: false, text: t(L, 'mg.kanalYok') };
      } catch {}
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hedef = rolCoz(ctx.guild, a.hedef) || await uyeCoz(ctx.guild, a.hedef);
      if (!hedef) return { ok: false, text: t(L, 'mg.hedefYok') };
      const izinAd = String(a.izin || '').toLocaleLowerCase('tr').trim();
      const bayraklar = KANAL_IZIN[izinAd];
      if (!bayraklar) return { ok: false, text: t(L, 'mg.rolIzinBos') };
      const durum = String(a.durum || '').toLocaleLowerCase('tr').trim();
      const deger = /^(ac|aç|açık|acik|allow|true|1)$/.test(durum) ? true
        : /^(kapat|kapalı|kapali|yasakla|deny|false|0)$/.test(durum) ? false : null;
      if (deger === null) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const yama = {};
        for (const b of bayraklar) yama[b] = deger;
        await kanal.permissionOverwrites.edit(hedef.id, yama, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.izinOk', { k: kanal.name, h: pingKir(hedef.name || (hedef.user && hedef.user.tag) || a.hedef), d: deger ? t(L, 'mg.izinAcik') : t(L, 'mg.izinKapali') }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  kategori_duzenle: {
    risk: 'dusuk',
    tool: { name: 'kategori_duzenle', description: 'Var olan bir kategori/grubun adını değiştirir. Örn: "YONETIM grubunun adını YÖNETİM yap".', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Mevcut kategori/grup adı' }, yeniAd: { type: 'string', description: 'Yeni ad' } }, required: ['ad', 'yeniAd'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kat = kategoriCoz(ctx.guild, a.ad)
        || kategoriCoz(ctx.guild, temizAd(a.ad, 90).toLocaleLowerCase('tr'));
      if (!kat) return { ok: false, text: t(L, 'mg.kategoriYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const yeniAd = temizAd(a.yeniAd, 90);
      if (!yeniAd) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const guncel = await kat.edit({ name: yeniAd }, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.kategoriDuzenlendi', { ad: pingKir(guncel.name) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_duzenle: {
    risk: 'yuksek',
    tool: { name: 'rol_duzenle', description: 'Var olan rolün adını, rengini veya izinlerini değiştirir. renk: #ff0000 gibi hex. izinler: ["mesaj gönder", "bağlan", "üye at", ...] listesi. YÖNETİCİ izni ASLA verilemez. Örn: "mod rolünün rengini kırmızı yap".', parameters: { type: 'object', properties: { rol: { type: 'string', description: 'Rol adı' }, yeniAd: { type: 'string', description: 'Yeni rol adı (boşsa değişmez)' }, renk: { type: 'string', description: '#rrggbb hex renk (boşsa değişmez)' }, izinler: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Verilecek izin adları listesi' } }, required: ['rol'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const rol = rolCoz(ctx.guild, a.rol);
      if (!rol) return { ok: false, text: t(L, 'mg.rolYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageRoles)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsi = isteyenRolUstu(ctx, rol, L);
      if (hiyerarsi) return hiyerarsi;
      try {
        if (rol.managed) return { ok: false, text: t(L, 'mg.yetkiYok') };
      } catch {}
      const yama = {};
      if (a.yeniAd) {
        const ad = temizAd(a.yeniAd, 100);
        if (ad) yama.name = ad;
      }
      if (a.renk) {
        const m = String(a.renk).trim().match(/^#?([0-9a-f]{6})$/i);
        if (m) yama.color = parseInt(m[1], 16);
      }
      if (Array.isArray(a.izinler) && a.izinler.length) {
        const bayraklar = [];
        for (const ham of a.izinler) {
          const k = String(ham || '').toLocaleLowerCase('tr').trim();
          const flag = IZIN_ADLARI[k];
          if (!flag) continue;
          if (YASAK_IZIN.has(flag)) return { ok: false, text: t(L, 'mg.rolAdminYasak') };
          if (PermissionFlagsBits[flag] !== undefined) bayraklar.push(flag);
        }
        if (!bayraklar.length) return { ok: false, text: t(L, 'mg.rolIzinBos') };
        // Üzerine yazma DEĞİL birleştirme: mevcut izinler korunur, yeniler eklenir.
        try {
          const mevcut = BigInt(rol.permissions.bitfield);
          const ek = bayraklar.reduce((acc, f) => acc | PermissionFlagsBits[f], 0n);
          yama.permissions = mevcut | ek;
        } catch {
          yama.permissions = bayraklar;
        }
      }
      if (!Object.keys(yama).length) return { ok: false, text: t(L, 'mg.adYok') };
      const ben = botUstu(ctx.guild);
      try {
        if (!ben || ben.roles.highest.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
        const guncel = await rol.edit(yama, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.rolDuzenlendi', { r: pingKir(guncel.name) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_sil: {
    risk: 'yuksek',
    tool: { name: 'rol_sil', description: 'Bir rolü sunucudan SİLER/kaldırır. Sadece kullanıcı açıkça rol sil derse kullan.', parameters: { type: 'object', properties: { rol: { type: 'string', description: 'Silinecek rol adı' } }, required: ['rol'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const rol = rolCoz(ctx.guild, a.rol);
      if (!rol) return { ok: false, text: t(L, 'mg.rolYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageRoles)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsi = isteyenRolUstu(ctx, rol, L);
      if (hiyerarsi) return hiyerarsi;
      try {
        if (rol.managed) return { ok: false, text: t(L, 'mg.yetkiYok') };
      } catch {}
      const ben = botUstu(ctx.guild);
      try {
        if (!ben || ben.roles.highest.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
        const ad = String(rol.name || '');
        await rol.delete(`AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.rolSilindi', { r: pingKir(ad) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  rol_sirala: {
    risk: 'yuksek',
    tool: { name: 'rol_sirala', description: 'Rolü sıralamada üste veya alta taşır. konum: ust (bot rolünün hemen altına) veya alt (en alta). Örn: "mod rolünü üste taşı".', parameters: { type: 'object', properties: { rol: { type: 'string', description: 'Rol adı' }, konum: { type: 'string', description: 'ust veya alt' } }, required: ['rol', 'konum'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const rol = rolCoz(ctx.guild, a.rol);
      if (!rol) return { ok: false, text: t(L, 'mg.rolYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageRoles)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsi = isteyenRolUstu(ctx, rol, L);
      if (hiyerarsi) return hiyerarsi;
      const ben = botUstu(ctx.guild);
      try {
        if (!ben || ben.roles.highest.comparePositionTo(rol) <= 0) return { ok: false, text: t(L, 'mg.rolHiyerarsi') };
        const konum = String(a.konum || '').toLocaleLowerCase('tr').trim();
        const hedefSira = konum === 'alt' ? 1 : Math.max(1, ben.roles.highest.position - 1);
        await rol.setPosition(hedefSira, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.rolTasindi', { r: pingKir(rol.name) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  toplu_sil: {
    risk: 'yuksek',
    tool: { name: 'toplu_sil', description: 'Listedeki kanal veya kategorileri TOPLUCA SİLER (en fazla 10). tur: kanal veya kategori. Dolu kategoriler ve bulunulan kanal atlanır, raporda görünür. Sadece kullanıcı açıkça çoklu silme isterse kullan.', parameters: { type: 'object', properties: { hedefler: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'Silinecek adlar listesi' }, tur: { type: 'string', description: 'kanal veya kategori' } }, required: ['hedefler'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const tur = String(a.tur || 'kanal').toLocaleLowerCase('tr').trim() === 'kategori' ? 'kategori' : 'kanal';
      const adlar = [...new Set((Array.isArray(a.hedefler) ? a.hedefler : []).map(s => String(s || '').trim()).filter(Boolean))].slice(0, 10);
      if (!adlar.length) return { ok: false, text: t(L, 'mg.adYok') };
      const satirlar = [];
      for (const ad of adlar) {
        const h = tur === 'kategori'
          ? (kategoriCoz(ctx.guild, ad) || kategoriCoz(ctx.guild, ad.toLocaleLowerCase('tr')))
          : kanalCoz(ctx.guild, ad);
        if (!h) { satirlar.push(`✗ ${pingKir(ad)}: ${t(L, tur === 'kategori' ? 'mg.kategoriYok' : 'mg.kanalYok')}`); continue; }
        if (h.id === (ctx.channel && ctx.channel.id)) { satirlar.push(`✗ ${pingKir(h.name)}: ${t(L, 'mg.topluBulundugunKanal')}`); continue; }
        try {
          if (h.type === ChannelType.GuildCategory && tur === 'kanal') { satirlar.push(`✗ ${pingKir(h.name)}: ${t(L, 'mg.kanalYok')}`); continue; }
        } catch {}
        if (tur === 'kategori') {
          let cocuk = 0;
          try { cocuk = ctx.guild.channels.cache.filter(c => c.parentId === h.id).size || 0; } catch {}
          if (cocuk > 0) { satirlar.push(`✗ ${pingKir(h.name)}: ${t(L, 'mg.topluDoluKategori', { n: cocuk })}`); continue; }
        }
        try {
          const isim = String(h.name || ad);
          await h.delete(`AI yönetim (${ctx.user.tag})`);
          satirlar.push(`✓ ${pingKir(isim)}`);
        } catch (e) { satirlar.push(`✗ ${pingKir(ad)}: ${discordHata(e, L)}`); }
        await bekle(600); // seri silme rate-limit freni
      }
      const ok = satirlar.some(s => s.startsWith('✓'));
      return { ok, text: satirlar.join('\n') };
    },
  },
  davet_olustur: {
    risk: 'dusuk',
    tool: { name: 'davet_olustur', description: 'Kanala katılım daveti oluşturur. sure: saniye (0=süresiz, max 604800), kullanim: max kullanım (0=sınırsız). Örn: "genel kanalına 1 kullanımlık davet oluştur".', parameters: { type: 'object', properties: { kanal: { type: 'string', description: 'Kanal adı (boşsa bulunulan kanal)' }, sure: { type: 'integer', description: 'Saniye (0-604800)' }, kullanim: { type: 'integer', description: 'Max kullanım (0=sınırsız)' } }, required: [] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.CreateInstantInvite)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      let ch = ctx.channel;
      if (a.kanal) {
        const bulunan = kanalCoz(ctx.guild, a.kanal);
        if (!bulunan) return { ok: false, text: t(L, 'mg.kanalYok') };
        ch = bulunan;
      }
      try {
        if (!ch || ch.type === ChannelType.GuildCategory || typeof ch.createInvite !== 'function') return { ok: false, text: t(L, 'mg.kanalYok') };
      } catch { return { ok: false, text: t(L, 'mg.kanalYok') }; }
      const sure = Number.isFinite(parseInt(a.sure, 10)) ? Math.min(604800, Math.max(0, parseInt(a.sure, 10))) : 0;
      const kullanim = Number.isFinite(parseInt(a.kullanim, 10)) ? Math.min(100, Math.max(0, parseInt(a.kullanim, 10))) : 0;
      try {
        const davet = await ch.createInvite({ maxAge: sure, maxUses: kullanim, reason: `AI yönetim (${ctx.user.tag})` });
        return { ok: true, text: t(L, 'mg.davetOk', { url: davet.url }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  toplu_sustur: {
    risk: 'yuksek',
    tool: { name: 'toplu_sustur', description: 'Listedeki üyeleri TOPLUCA susturur/mute atar (en fazla 10). sure: dakika (1-40320). Örn: "bu üçünü 10 dakika sustur".', parameters: { type: 'object', properties: { hedefler: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'Kullanıcı adları listesi' }, sure: { type: 'integer', description: 'Dakika (1-40320)' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedefler', 'sure'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ModerateMembers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hamSure = parseInt(a.sure, 10);
      if (!Number.isFinite(hamSure) || hamSure < 1) return { ok: false, text: t(L, 'mg.sureYok') };
      const dk = Math.min(40320, hamSure);
      const adlar = [...new Set((Array.isArray(a.hedefler) ? a.hedefler : []).map(s => String(s || '').trim()).filter(Boolean))].slice(0, 10);
      if (!adlar.length) return { ok: false, text: t(L, 'mg.hedefYok') };
      const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
      const satirlar = [];
      for (const ad of adlar) {
        const hedef = await uyeCoz(ctx.guild, ad);
        const g = hedefGuvenli(ctx.guild, hedef, L);
        if (!g.ok) { satirlar.push(`✗ ${pingKir(ad)}: ${g.text}`); continue; }
        const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
        if (hiyerarsiUye) { satirlar.push(`✗ ${pingKir(hedef.user.tag)}: ${hiyerarsiUye.text}`); continue; }
        if (!hedef.moderatable) { satirlar.push(`✗ ${pingKir(hedef.user.tag)}: ${t(L, 'mg.hiyerarsi')}`); continue; }
        try {
          await hedef.timeout(dk * 60 * 1000, `AI yönetim (${ctx.user.tag}): ${sebep}`);
          satirlar.push(`✓ ${t(L, 'mg.timeoutOk', { u: pingKir(hedef.user.tag), dk })}`);
        } catch (e) { satirlar.push(`✗ ${pingKir(ad)}: ${discordHata(e, L)}`); }
        await bekle(600); // seri susturma rate-limit freni
      }
      return { ok: satirlar.some(s => s.startsWith('✓')), text: satirlar.join('\n') };
    },
  },
  toplu_at: {
    risk: 'yuksek',
    tool: { name: 'toplu_at', description: 'Listedeki üyeleri sunucudan TOPLUCA ATAR/kovar (en fazla 10). Sadece kullanıcı açıkça çoklu atma isterse kullan.', parameters: { type: 'object', properties: { hedefler: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'Kullanıcı adları listesi' }, sebep: { type: 'string', description: 'Sebep' } }, required: ['hedefler'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.KickMembers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const adlar = [...new Set((Array.isArray(a.hedefler) ? a.hedefler : []).map(s => String(s || '').trim()).filter(Boolean))].slice(0, 10);
      if (!adlar.length) return { ok: false, text: t(L, 'mg.hedefYok') };
      const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
      const satirlar = [];
      for (const ad of adlar) {
        const hedef = await uyeCoz(ctx.guild, ad);
        const g = hedefGuvenli(ctx.guild, hedef, L);
        if (!g.ok) { satirlar.push(`✗ ${pingKir(ad)}: ${g.text}`); continue; }
        const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
        if (hiyerarsiUye) { satirlar.push(`✗ ${pingKir(hedef.user.tag)}: ${hiyerarsiUye.text}`); continue; }
        if (!hedef.kickable) { satirlar.push(`✗ ${pingKir(hedef.user.tag)}: ${t(L, 'mg.hiyerarsi')}`); continue; }
        try {
          await hedef.kick(`AI yönetim (${ctx.user.tag}): ${sebep}`);
          satirlar.push(`✓ ${t(L, 'mg.kickOk', { u: pingKir(hedef.user.tag) })}`);
        } catch (e) { satirlar.push(`✗ ${pingKir(ad)}: ${discordHata(e, L)}`); }
        await bekle(600); // seri atma rate-limit freni
      }
      return { ok: satirlar.some(s => s.startsWith('✓')), text: satirlar.join('\n') };
    },
  },
  nick_degistir: {
    risk: 'yuksek',
    tool: { name: 'nick_degistir', description: 'Bir üyenin sunucudaki TAKMA ADINI (nickname) değiştirir. Örn: "ahmetin takma adını Pro yap".', parameters: { type: 'object', properties: { hedef: { type: 'string', description: 'Kullanıcı adı' }, nick: { type: 'string', description: 'Yeni takma ad (1-32 karakter)' } }, required: ['hedef', 'nick'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const hedef = await uyeCoz(ctx.guild, a.hedef);
      const g = hedefGuvenli(ctx.guild, hedef, L);
      if (!g.ok) return g;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageNicknames)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const hiyerarsiUye = isteyenUyeUstu(ctx, hedef, L);
      if (hiyerarsiUye) return hiyerarsiUye;
      const nick = temizAd(a.nick, 32);
      if (!nick) return { ok: false, text: t(L, 'mg.adYok') };
      if (!hedef.manageable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        await hedef.setNickname(nick, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.nickOk', { u: hedef.user.tag, n: pingKir(nick) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  sabitle: {
    risk: 'dusuk',
    tool: { name: 'sabitle', description: 'Bulunulan kanaldaki bir mesajı SABİTLER (pinler). mesajId: mesajın IDsi (mesaja sağ tık > ID Kopyala).', parameters: { type: 'object', properties: { mesajId: { type: 'string', description: 'Sabitlenecek mesaj IDsi' } }, required: ['mesajId'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageMessages)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const id = String(a.mesajId || '').trim();
      if (!/^\d{17,20}$/.test(id)) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const ch = ctx.channel;
        if (!ch || typeof ch.messages.fetch !== 'function') return { ok: false, text: t(L, 'mg.kanalYok') };
        try {
          const sabitli = await ch.messages.fetchPinned().catch(() => null);
          if (sabitli && sabitli.size >= 50) return { ok: false, text: t(L, 'mg.pinDolu') };
        } catch {}
        const msg = await ch.messages.fetch(id).catch(() => null);
        if (!msg) return { ok: false, text: t(L, 'mg.mesajYok') };
        await msg.pin(`AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.sabitOk') };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  duyuru_yayinla: {
    risk: 'dusuk',
    tool: { name: 'duyuru_yayinla', description: 'Duyuru (haber) kanalındaki bir mesajı YAYINLAR (tüm takipçi sunuculara gider). mesajId yoksa kanaldaki son bot mesajı yayınlanır.', parameters: { type: 'object', properties: { mesajId: { type: 'string', description: 'Yayınlanacak mesaj IDsi (boşsa son mesaj)' } }, required: [] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageMessages)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      try {
        const ch = ctx.channel;
        if (!ch || typeof ch.messages.fetch !== 'function') return { ok: false, text: t(L, 'mg.kanalYok') };
        try {
          if (ch.type !== ChannelType.GuildAnnouncement) return { ok: false, text: t(L, 'mg.duyuruDegil') };
        } catch {}
        let msg = null;
        const id = String(a.mesajId || '').trim();
        if (/^\d{17,20}$/.test(id)) msg = await ch.messages.fetch(id).catch(() => null);
        else {
          const son = await ch.messages.fetch({ limit: 5 }).catch(() => null);
          if (son) msg = [...son.values()].find(m => m && typeof m.crosspost === 'function') || null;
        }
        if (!msg || typeof msg.crosspost !== 'function') return { ok: false, text: t(L, 'mg.mesajYok') };
        await msg.crosspost();
        return { ok: true, text: t(L, 'mg.duyuruOk') };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  yavas_mod: {
    risk: 'dusuk',
    tool: { name: 'yavas_mod', description: 'Metin kanalına YAVAŞ MOD koyar (mesaj arası bekleme). sure: saniye 0-21600 (0=kapatır). kanal boşsa bulunulan kanal. Örn: "bu kanala 10 saniye yavaş mod koy".', parameters: { type: 'object', properties: { kanal: { type: 'string', description: 'Kanal adı (boşsa bulunulan)' }, sure: { type: 'integer', description: 'Saniye (0-21600)' } }, required: ['sure'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      let ch = ctx.channel;
      if (a.kanal) {
        const bulunan = kanalCoz(ctx.guild, a.kanal);
        if (!bulunan) return { ok: false, text: t(L, 'mg.kanalYok') };
        ch = bulunan;
      }
      const sn = parseInt(a.sure, 10);
      if (!Number.isFinite(sn) || sn < 0) return { ok: false, text: t(L, 'mg.sayiYok') };
      try {
        if (!ch || typeof ch.setRateLimitPerUser !== 'function') return { ok: false, text: t(L, 'mg.kanalYok') };
        await ch.setRateLimitPerUser(Math.min(21600, sn), `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.yavasOk', { k: ch.name, sn: Math.min(21600, sn) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  sunucu_duzenle: {
    risk: 'yuksek',
    tool: { name: 'sunucu_duzenle', description: 'SUNUCU AYARLARINI değiştirir: isim, açıklama, doğrulama seviyesi (yok/dusuk/orta/yuksek/cok-yuksek), AFK kanalı+süresi, sistem kanalı. En az bir alan dolu olmalı. Örn: "sunucu doğrulamasını ortaya al".', parameters: { type: 'object', properties: { isim: { type: 'string', description: 'Yeni sunucu adı' }, aciklama: { type: 'string', description: 'Yeni sunucu açıklaması' }, dogrulama: { type: 'string', description: 'yok, dusuk, orta, yuksek, cok-yuksek' }, afkKanal: { type: 'string', description: 'AFK ses kanalı adı' }, afkSure: { type: 'integer', description: 'AFK süresi sn (60/300/900/1800/3600)' }, sistemKanal: { type: 'string', description: 'Sistem mesaj kanalı adı' } }, required: [] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageGuild)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const yama = {};
      if (a.isim) {
        const ad = temizAd(a.isim, 100);
        if (ad) yama.name = ad;
      }
      if (a.aciklama !== undefined && a.aciklama !== null) yama.description = clip(String(a.aciklama), 120) || null;
      if (a.dogrulama) {
        const norm = String(a.dogrulama).toLocaleLowerCase('tr').trim().replace(/[_\s]+/g, '-');
        const seviye = { yok: 0, none: 0, dusuk: 1, 'düşük': 1, low: 1, orta: 2, medium: 2, yuksek: 3, 'yüksek': 3, high: 3, 'cok-yuksek': 4, 'çok-yüksek': 4, cokyuksek: 4, 'very-high': 4, veryhigh: 4 }[norm];
        if (seviye === undefined) return { ok: false, text: t(L, 'mg.dogrulamaYok') };
        yama.verificationLevel = seviye;
      }
      if (a.afkKanal) {
        const k = kanalCoz(ctx.guild, a.afkKanal);
        if (!k) return { ok: false, text: t(L, 'mg.kanalYok') };
        try {
          if (k.type !== ChannelType.GuildVoice && k.type !== ChannelType.GuildStageVoice) return { ok: false, text: t(L, 'mg.afkSesYok') };
        } catch {}
        yama.afkChannel = k;
      }
      if (a.afkSure !== undefined && a.afkSure !== null && a.afkSure !== '') {
        const sn = parseInt(a.afkSure, 10);
        const gecerli = [60, 300, 900, 1800, 3600];
        if (!Number.isFinite(sn) || !gecerli.includes(sn)) return { ok: false, text: t(L, 'mg.afkSureYok') };
        yama.afkTimeout = sn;
      }
      if (a.sistemKanal) {
        const k = kanalCoz(ctx.guild, a.sistemKanal);
        if (!k) return { ok: false, text: t(L, 'mg.kanalYok') };
        try {
          if (k.type !== ChannelType.GuildText) return { ok: false, text: t(L, 'mg.sistemMetinYok') };
        } catch {}
        yama.systemChannel = k;
      }
      if (!Object.keys(yama).length) return { ok: false, text: t(L, 'mg.bosIslem') };
      try {
        const g = await ctx.guild.edit(yama, `AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.sunucuOk2', { ad: pingKir(g.name) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  emoji_ekle: {
    risk: 'yuksek',
    tool: { name: 'emoji_ekle', description: 'İnternetteki bir görseli sunucuya EMOJİ olarak ekler. url: görsel bağlantısı (png/jpg/gif), ad: 2-32 karakter (harf/rakam/altçizgi). Örn: "bu görseli eglence emojisi yap".', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Görsel URLsi' }, ad: { type: 'string', description: 'Emoji adı' } }, required: ['url', 'ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageEmojisAndStickers)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const url = String(a.url || '').trim();
      const ad = String(a.ad || '').trim().replace(/\s+/g, '_');
      if (!/^https?:\/\/\S{4,1500}$/i.test(url) || !/\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(url)) return { ok: false, text: t(L, 'mg.adYok') };
      if (!/^[\p{L}\p{N}_]{2,32}$/u.test(ad)) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const mevcut = (ctx.guild.emojis && ctx.guild.emojis.cache && ctx.guild.emojis.cache.size) || 0;
        const tier = (ctx.guild && ctx.guild.premiumTier) || 0;
        const slot = [50, 100, 150, 250][tier] || 50;
        if (mevcut >= slot) return { ok: false, text: t(L, 'mg.emojiDolu') };
      } catch {}
      try {
        const emoji = await ctx.guild.emojis.create({ attachment: url, name: ad, reason: `AI yönetim (${ctx.user.tag})` });
        return { ok: true, text: t(L, 'mg.emojiOk', { e: String(emoji) }) };
      } catch (e) { return { ok: false, text: discordHata(e, L, t(L, 'mg.emojiHata')) }; }
    },
  },
  sablon_uygula: {
    risk: 'yuksek',
    tool: { name: 'sablon_uygula', description: 'Hazır sunucu mimarisini TEK SEFERDE kurar (kategori+kanal+rol seti). sablon: oyun, topluluk, ders veya kayıtlı özel şablon adı. Örn: "oyun sunucusu kur".', parameters: { type: 'object', properties: { sablon: { type: 'string', description: 'Şablon adı (oyun, topluluk, ders, ...)' } }, required: ['sablon'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageGuild)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const plan = sablonPlanla(a.sablon);
      if (!plan) {
        const oneri = sablonOneri(a.sablon);
        let metin = t(L, 'mg.sablonYok', { liste: sablonListesi() });
        if (oneri) metin += '\n' + t(L, 'mg.sablonOneri', { ad: oneri });
        return { ok: false, text: metin };
      }
      const satirlar = [];
      for (const adim of plan.adimlar.slice(0, 15)) {
        // Şablonlar SADECE oluşturma adımı içerebilir (yıkıcı op sızamaz).
        // Kapalı işlem şablon içinden de çalışmaz (kill-switch bypass yok).
        const giris = adim && KATALOG[adim.op];
        let acik = Boolean(giris);
        try {
          if (acik) acik = require('./ai-perms').isOpEnabled(adim.op, KATALOG);
        } catch { acik = false; }
        if (!acik || !['kategori_ac', 'kanal_ac', 'rol_olustur'].includes(adim.op)) { satirlar.push(`✗ ${adim && adim.op}`); continue; }
        try {
          const r = await giris.run(ctx, (adim.args && typeof adim.args === 'object') ? adim.args : {});
          satirlar.push((r.ok ? '✓ ' : '✗ ') + clip(String(r.text || ''), 300));
        } catch (e) { satirlar.push(`✗ ${adim.op}: ${discordHata(e, L)}`); }
        await bekle(600); // seri create rate-limit freni
      }
      if (plan.adimlar.length > 15) satirlar.push(t(L, 'mg.cokluAtlandi', { n: plan.adimlar.length - 15 }));
      return { ok: satirlar.some(s => s.startsWith('✓')), text: `${t(L, 'mg.sablonBaslik', { ad: plan.ad })}\n${satirlar.join('\n')}` };
    },
  },
  sablon_kaydet: {
    risk: 'dusuk',
    tool: { name: 'sablon_kaydet', description: 'Mevcut sunucu yapısını (kategori+kanal+rol adları; metin/ses/duyuru kanalları, ilk 10 rol) şablon olarak kaydeder; sonra sablon_uygula ile kurulur. Rol izinleri KAYDEDİLMEZ (ad+renk saklanır).', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Şablon adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageGuild)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const key = String(a.ad || '').toLocaleLowerCase('tr').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}\-_]/gu, '').slice(0, 30);
      if (!key) return { ok: false, text: t(L, 'mg.adYok') };
      // Prototype pollution + hazır ad koruması + sessiz üzerine-yazma yok.
      if (['__proto__', 'constructor', 'prototype'].includes(key)) return { ok: false, text: t(L, 'mg.adYok') };
      if (SABLONLAR[key]) return { ok: false, text: t(L, 'mg.sablonHazirVar') };
      try {
        if (Object.prototype.hasOwnProperty.call(sablonOku(), key)) return { ok: false, text: t(L, 'mg.sablonZatenVar') };
      } catch {}
      const adimlar = [];
      try {
        const kanallar = [...ctx.guild.channels.cache.values()];
        for (const c of kanallar.filter(c => c.type === ChannelType.GuildCategory).sort((x, y) => (x.position || 0) - (y.position || 0))) {
          adimlar.push({ op: 'kategori_ac', args: { ad: String(c.name || '').slice(0, 90) } });
        }
        for (const c of kanallar.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildAnnouncement).sort((x, y) => (x.position || 0) - (y.position || 0))) {
          const eb = c.parent ? String(c.parent.name || '').slice(0, 90) : null;
          adimlar.push({ op: 'kanal_ac', args: { ad: String(c.name || '').slice(0, 90), tur: c.type === ChannelType.GuildVoice ? 'ses' : 'metin', ...(eb ? { ebeveyn: eb } : {}) } });
        }
        for (const r of [...ctx.guild.roles.cache.values()].filter(r => !r.managed && r.name !== '@everyone').sort((x, y) => (x.position || 0) - (y.position || 0)).slice(0, 10)) {
          const renk = typeof r.color === 'number' && r.color ? `#${r.color.toString(16).padStart(6, '0')}` : undefined;
          adimlar.push({ op: 'rol_olustur', args: { ad: String(r.name || '').slice(0, 90), ...(renk ? { renk } : {}) } });
        }
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
      if (!adimlar.length) return { ok: false, text: t(L, 'mg.bosIslem') };
      try {
        const m = sablonOku();
        m[key] = { ad: key, olusturan: (ctx.user && ctx.user.tag) || null, tarih: Date.now(), adimlar: adimlar.slice(0, 60) };
        sablonYaz(m);
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
      return { ok: true, text: t(L, 'mg.sablonKaydedildi', { ad: key, n: adimlar.length }) };
    },
  },
  yedek_al: {
    risk: 'dusuk',
    tool: { name: 'yedek_al', description: 'Sunucu yapısının (kategori, kanal, rol, emoji sayıları + ad listeleri) JSON YEDEĞİNİ dosyayla kanala gönderir. Geri yükleme yapmaz.', parameters: { type: 'object', properties: {}, required: [] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageGuild)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      try {
        const g = ctx.guild;
        const kanallar = [...g.channels.cache.values()];
        const yedek = {
          sunucu: g.name, id: g.id, tarih: new Date().toISOString(),
          kategoriler: kanallar.filter(c => c.type === ChannelType.GuildCategory).slice(0, 60).map(c => c.name),
          kanallar: kanallar.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildAnnouncement).slice(0, 200)
            .map(c => ({ ad: c.name, tur: c.type === ChannelType.GuildVoice ? 'ses' : 'metin', ebeveyn: (c.parent && c.parent.name) || null, konu: (c.topic && clip(c.topic, 200)) || null })),
          roller: [...g.roles.cache.values()].filter(r => r.name !== '@everyone').slice(0, 200)
            .map(r => ({ ad: r.name, renk: r.color || 0, yonetici: Boolean(r.managed), izinBits: (r.permissions && r.permissions.bitfield && String(r.permissions.bitfield)) || '0' })),
          emojiSayisi: (g.emojis && g.emojis.cache && g.emojis.cache.size) || 0,
          uyeSayisi: g.memberCount || 0,
        };
        const dosya = Buffer.from(JSON.stringify(yedek, null, 2), 'utf8');
        await ctx.channel.send({ files: [{ attachment: dosya, name: `yedek-${g.id}.json` }] });
        return { ok: true, text: t(L, 'mg.yedekOk', { k: yedek.kategoriler.length, n: yedek.kanallar.length, r: yedek.roller.length }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
  etkinlik_baslat: {
    risk: 'dusuk',
    tool: { name: 'etkinlik_baslat', description: 'Sunucuda ZAMANLANMIŞ ETKİNLİK oluşturur. ad zorunlu; dakikaSonra (varsayılan 60), sureDakika (varsayılan 60), kanal (ses kanalı adı verilirse sesli etkinlik, yoksa harici) alabilir. Örn: "yarın turnuva etkinliği başlat".', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Etkinlik adı' }, aciklama: { type: 'string', description: 'Açıklama' }, dakikaSonra: { type: 'integer', description: 'Kaç dakika sonra başlasın' }, sureDakika: { type: 'integer', description: 'Süre (dakika)' }, kanal: { type: 'string', description: 'Ses kanalı adı (boşsa harici etkinlik)' }, konum: { type: 'string', description: 'Harici etkinlik konumu' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageEvents)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      const ad = temizAd(a.ad, 100);
      if (!ad) return { ok: false, text: t(L, 'mg.adYok') };
      const sonraDk = Number.isFinite(parseInt(a.dakikaSonra, 10)) ? Math.min(525600, Math.max(10, parseInt(a.dakikaSonra, 10))) : 60;
      const sureDk = Number.isFinite(parseInt(a.sureDakika, 10)) ? Math.min(10080, Math.max(10, parseInt(a.sureDakika, 10))) : 60;
      const baslangic = new Date(Date.now() + sonraDk * 60 * 1000);
      const bitis = new Date(baslangic.getTime() + sureDk * 60 * 1000);
      let kanal = null;
      if (a.kanal) {
        const bulunan = kanalCoz(ctx.guild, a.kanal);
        try {
          if (bulunan && (bulunan.type === ChannelType.GuildVoice || bulunan.type === ChannelType.GuildStageVoice)) kanal = bulunan;
        } catch {}
      }
      try {
        const etkinlik = await ctx.guild.scheduledEvents.create({
          name: ad,
          description: clip(String(a.aciklama || ''), 1000) || undefined,
          scheduledStartTime: baslangic,
          scheduledEndTime: bitis,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          ...(kanal
            ? { channel: kanal.id, entityType: GuildScheduledEventEntityType.Voice }
            : { entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: clip(String(a.konum || 'Discord'), 100) } }),
          reason: `AI yönetim (${ctx.user.tag})`,
        });
        return { ok: true, text: t(L, 'mg.etkinlikOk', { ad: etkinlik.name }) };
      } catch (e) { return { ok: false, text: discordHata(e, L) }; }
    },
  },
};

// --- Hazır sunucu şablonları (sablon_uygula) ---
const SABLONLAR = {
  oyun: {
    aciklama: 'Oyun topluluğu: bilgi + sohbet + ses + oyuncu rolü',
    adimlar: [
      { op: 'kategori_ac', args: { ad: 'BİLGİ' } },
      { op: 'kanal_ac', args: { ad: 'kurallar', tur: 'metin', ebeveyn: 'BİLGİ' } },
      { op: 'kanal_ac', args: { ad: 'duyurular', tur: 'metin', ebeveyn: 'BİLGİ' } },
      { op: 'kategori_ac', args: { ad: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'genel', tur: 'metin', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'medya', tur: 'metin', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'sesli-sohbet', tur: 'ses', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'oyun-odası', tur: 'ses', ebeveyn: 'SOHBET' } },
      { op: 'rol_olustur', args: { ad: 'Oyuncu' } },
    ],
  },
  topluluk: {
    aciklama: 'Genel topluluk: duyurular + sohbet + ses + üye rolü',
    adimlar: [
      { op: 'kategori_ac', args: { ad: 'DUYURULAR' } },
      { op: 'kanal_ac', args: { ad: 'duyurular', tur: 'metin', ebeveyn: 'DUYURULAR' } },
      { op: 'kanal_ac', args: { ad: 'kurallar', tur: 'metin', ebeveyn: 'DUYURULAR' } },
      { op: 'kanal_ac', args: { ad: 'etkinlikler', tur: 'metin', ebeveyn: 'DUYURULAR' } },
      { op: 'kategori_ac', args: { ad: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'genel', tur: 'metin', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'tanışma', tur: 'metin', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'öneriler', tur: 'metin', ebeveyn: 'SOHBET' } },
      { op: 'kanal_ac', args: { ad: 'sohbet-odası', tur: 'ses', ebeveyn: 'SOHBET' } },
      { op: 'rol_olustur', args: { ad: 'Üye' } },
    ],
  },
  ders: {
    aciklama: 'Eğitim sunucusu: ders kanalları + sesli ders odası + öğrenci/öğretmen',
    adimlar: [
      { op: 'kategori_ac', args: { ad: 'DERSLER' } },
      { op: 'kanal_ac', args: { ad: 'duyurular', tur: 'metin', ebeveyn: 'DERSLER' } },
      { op: 'kanal_ac', args: { ad: 'ders-notları', tur: 'metin', ebeveyn: 'DERSLER' } },
      { op: 'kanal_ac', args: { ad: 'soru-cevap', tur: 'metin', ebeveyn: 'DERSLER' } },
      { op: 'kanal_ac', args: { ad: 'kaynaklar', tur: 'metin', ebeveyn: 'DERSLER' } },
      { op: 'kanal_ac', args: { ad: 'ders-odası', tur: 'ses', ebeveyn: 'DERSLER' } },
      { op: 'rol_olustur', args: { ad: 'Öğrenci' } },
      { op: 'rol_olustur', args: { ad: 'Öğretmen' } },
    ],
  },
};

const SABLON_DOSYA = 'sablonlar.json';
function sablonOku() {
  const m = load(SABLON_DOSYA, {});
  return (m && typeof m === 'object') ? m : {};
}
function sablonYaz(map) {
  save(SABLON_DOSYA, map || {});
}
function sablonListesi() {
  // Özel şablon adları herkese dökülmez: hazırlar + sayı özeti.
  try {
    const ozelSayi = Object.keys(sablonOku()).length;
    const hazir = Object.keys(SABLONLAR).join(', ');
    return ozelSayi > 0 ? `${hazir} (+${ozelSayi} özel)` : hazir;
  } catch {
    return Object.keys(SABLONLAR).join(', ');
  }
}
// Yakın şablon önerisi ("oyun sunucusu kur" -> oyun).
function sablonOneri(ad) {
  try {
    const k = String(ad || '').toLocaleLowerCase('tr').trim();
    if (!k) return null;
    const adlar = [...Object.keys(SABLONLAR), ...Object.keys(sablonOku())];
    return adlar.find(a => a.includes(k) || k.includes(a)) || null;
  } catch {
    return null;
  }
}
// Şablon adından çalıştırılabilir adım listesi kurar (saf fonksiyon: test edilebilir).
// Dönüş: { ad, adimlar } ya da null (bilinmeyen şablon).
function sablonPlanla(ad) {
  const key = String(ad || '').toLocaleLowerCase('tr').trim();
  if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) return null;
  if (Object.prototype.hasOwnProperty.call(SABLONLAR, key)) return { ad: key, adimlar: SABLONLAR[key].adimlar };
  try {
    const ozel = sablonOku();
    if (Object.prototype.hasOwnProperty.call(ozel, key)) {
      const s = ozel[key];
      if (s && Array.isArray(s.adimlar) && s.adimlar.length) {
        return { ad: key, adimlar: s.adimlar.slice(0, 60) };
      }
    }
  } catch {}
  return null;
}

// --- Kalıcı hatırlatıcılar (restart'a dayanıklı) ---
const HATIRLATICI_DOSYA = 'hatirlaticilar.json';
function hatirlaticiOku() {
  const m = load(HATIRLATICI_DOSYA, {});
  return (m && typeof m === 'object') ? m : {};
}
function hatirlaticiYaz(map) {
  save(HATIRLATICI_DOSYA, map || {});
}
function hatirlaticiSil(id) {
  try {
    const m = hatirlaticiOku();
    if (m && m[id]) { delete m[id]; hatirlaticiYaz(m); }
  } catch {}
}
async function hatirlaticiAtesle(client, kayit) {
  try { hatirlaticiSil(kayit && kayit.id); } catch {}
  try {
    if (!client || !kayit || !kayit.channelId) return;
    const kanal = client.channels.cache.get(kayit.channelId)
      || await client.channels.fetch(kayit.channelId).catch(() => null);
    if (!kanal || typeof kanal.send !== 'function') return;
    const L = kayit.lang === 'en' ? 'en' : 'tr';
    await kanal.send(t(L, 'rem.fire', { u: `<@${kayit.userId}>`, m: kayit.mesaj })).catch(() => {});
  } catch {}
}
function planlaHatirlatici(client, kayit) {
  if (!kayit || !kayit.fireAt) return;
  const ms = Math.max(0, kayit.fireAt - Date.now());
  // setTimeout üst sınırı (~24.8 gün); hatırlatıcı max 7 gün zaten.
  setTimeout(() => { hatirlaticiAtesle(client, kayit); }, Math.min(ms, 2147483647));
}
// Açılışta çağrılır: dosyadaki bekleyenleri yeniden zamanlar.
function restoreHatirlaticilar(client) {
  try {
    const m = hatirlaticiOku();
    const keys = Object.keys(m);
    for (const k of keys) planlaHatirlatici(client, { id: k, ...m[k] });
    if (keys.length) console.log(`Hatırlatıcı geri yüklendi: ${keys.length}`);
  } catch {}
}

// Ollama native tools dizisi (sadece açık işlemler)
function toolListesi(acikOp) {
  return Object.values(KATALOG)
    .filter(o => !acikOp || acikOp(o))
    .map(o => ({ type: 'function', function: o.tool }));
}

// Niyet ajanına gönderilen KISA şema: 35 aracın tam açıklaması ~14KB edip
// 4096 ctx'i dolduruyor; model araçları göremez hale gelip halüsinasyon
// görüyor ("araç bulunmamaktadır", qwen3.5:9b pilotuyla kanıtlandı).
// Ad + zorunlu alan + tek-cümle özet aynı seçimi çok daha küçük bağlamda
// yaptırır (num_ctx'e dokunulmaz, VRAM/OOM riski yok). Şekil aynı kalır,
// sadece description'lar kısalır; argDogrula zaten sunucuda doğrular.
function kisaAciklama(s, max) {
  const t = String(s || '').split(/[.!\n]/)[0].trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}
function toolListesiKisa(acikOp) {
  return Object.values(KATALOG)
    .filter(o => !acikOp || acikOp(o))
    .map(o => {
      const t = o.tool || {};
      const p = t.parameters || {};
      const oz = {};
      for (const [k, v] of Object.entries(p.properties || {})) {
        const nv = { type: v.type };
        if (v.enum) nv.enum = v.enum;
        if (Number.isFinite(v.maxItems)) nv.maxItems = v.maxItems;
        if (Number.isFinite(v.minItems)) nv.minItems = v.minItems;
        if (v.type === 'array' && v.items) nv.items = { type: v.items.type || 'string' };
        if (v.description) nv.description = kisaAciklama(v.description, 80);
        oz[k] = nv;
      }
      const pk = { type: 'object', properties: oz };
      if (Array.isArray(p.required)) pk.required = p.required;
      return { type: 'function', function: { name: t.name, description: kisaAciklama(t.description, 140), parameters: pk } };
    });
}

module.exports = { KATALOG, toolListesi, toolListesiKisa, uyeCoz, rolCoz, kanalCoz, kategoriCoz, sonKategoriKaydet, sonKategoriAl, planlaHatirlatici, restoreHatirlaticilar, isteyenUyeUstu, SABLONLAR, sablonPlanla, sablonListesi, sablonOneri, discordHata };
