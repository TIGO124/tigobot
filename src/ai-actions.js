// AI yönetim işlem kataloğu (FAZ 1: tam kapsam, sadece yerel 9B ajanomentari kullanır).
// - Her işlem: { key, risk: 'dusuk'|'yuksek', tool (Ollama tools şeması), run(ctx, args) }.
// - run() sonucu: { ok:true, text } ya da { ok:false, text } (kullanıcıya gösterilir).
// - Güvenlik: whitelist dışı op çalışmaz; hiyerarşi/bot/sahip kontrolleri run() içinde.
// - ctx: { guild, channel, member (isteyen), user, lang, client }.
const { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { t } = require('./i18n');
const { clip } = require('./sanitize');
const { anketEmbed } = require('./commands/anket');
const { load, save } = require('./store');

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
// Rol işlemlerinde isteyenin en yüksek rolü hedeften üstte olmalı
// (yoksa düşük yetkili, bot üzerinden yüksek rol dağıtır).
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
    },
  },
  kategori_sil: {
    risk: 'yuksek',
    tool: { name: 'kategori_sil', description: 'Sunucudaki bir KATEGORİYİ/grubu/bölümü SİLER/kaldırır. Kullanıcı grup/kategori/bölüm sil derse BU araç (kanal_sil değil). Onay sonrası çalışır; altındaki kanallar silinmez, kategorisiz kalır.', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Silinecek kategori/grup adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const kat = kategoriCoz(ctx.guild, a.ad)
        || kategoriCoz(ctx.guild, temizAd(a.ad, 90).toLocaleLowerCase('tr'));
      if (!kat) return { ok: false, text: t(L, 'mg.kategoriYok') };
      if (!isteyenIzni(ctx, PermissionFlagsBits.ManageChannels)) return { ok: false, text: t(L, 'mg.yetkiYok') };
      let cocuk = 0;
      try {
        cocuk = ctx.guild.channels.cache.filter(c => c.parentId === kat.id).size || 0;
      } catch { cocuk = 0; }
      try {
        const ad = String(kat.name || '');
        await kat.delete(`AI yönetim (${ctx.user.tag})`);
        return { ok: true, text: t(L, 'mg.kategoriSilindi', { ad }) + (cocuk > 0 ? ' ' + t(L, 'mg.kategoriSilindiNot', { n: cocuk }) : '') };
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
    },
  },
  rol_olustur: {
    risk: 'dusuk',
    tool: { name: 'rol_olustur', description: 'Sunucuda yeni rol/rütbe oluşturur/ekler.', parameters: { type: 'object', properties: { ad: { type: 'string', description: 'Rol adı' } }, required: ['ad'] } },
    async run(ctx, a) {
      const L = ctx.lang;
      const ad = temizAd(a.ad, 90);
      if (!ad) return { ok: false, text: t(L, 'mg.adYok') };
      try {
        const rol = await ctx.guild.roles.create({ name: ad, reason: `AI yönetim (${ctx.user.tag})` });
        return { ok: true, text: t(L, 'mg.rolOlusu', { r: rol }) };
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      const dk = Math.min(40320, hamSure);
      if (!hedef.moderatable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.timeout(dk * 60 * 1000, `AI yönetim (${ctx.user.tag}): ${sebep}`);
        return { ok: true, text: t(L, 'mg.timeoutOk', { u: hedef.user.tag, dk }) };
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      if (!hedef.kickable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.kick(`AI yönetim (${ctx.user.tag}): ${sebep}`);
        return { ok: true, text: t(L, 'mg.kickOk', { u: hedef.user.tag }) };
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      if (!hedef.bannable) return { ok: false, text: t(L, 'mg.hiyerarsi') };
      try {
        const sebep = temizAd(a.sebep || t(L, 'warn.noreason'), 400);
        await hedef.ban({ reason: `AI yönetim (${ctx.user.tag}): ${sebep}` });
        return { ok: true, text: t(L, 'mg.banOk', { u: hedef.user.tag }) };
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
    },
  },
  anket_baslat: {
    risk: 'dusuk',
    tool: { name: 'anket_baslat', description: 'Butonlu anket/oylama başlatır/açar (2-4 seçenek).', parameters: { type: 'object', properties: { soru: { type: 'string', description: 'Anket sorusu' }, secenekler: { type: 'array', items: { type: 'string' }, minItems: 2, description: '2-4 seçenek' } }, required: ['soru', 'secenekler'] } },
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
      } catch { return { ok: false, text: t(L, 'mg.yetkiYok') }; }
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
};

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
  const bekle = Math.max(0, kayit.fireAt - Date.now());
  // setTimeout üst sınırı (~24.8 gün); hatırlatıcı max 7 gün zaten.
  setTimeout(() => { hatirlaticiAtesle(client, kayit); }, Math.min(bekle, 2147483647));
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

module.exports = { KATALOG, toolListesi, uyeCoz, rolCoz, kanalCoz, kategoriCoz, sonKategoriKaydet, sonKategoriAl, planlaHatirlatici, restoreHatirlaticilar };
