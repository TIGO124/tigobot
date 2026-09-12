// AI yönetim akışı (orkestrasyon).
// Dönen değer: true = istek yönetimce ele alındı (yanıt verildi), false/null = normal sohbete düş.
// - DM'de yönetim yok (guild şart).
// - ai-perms: global/sunucu açık + kim-kullanır kontrolü.
// - Yüksek-risk + onay gerektiren işlem -> buton onayı (60 sn), yoksa direkt çalışır.
// - Her uygulama denetim loguna düşer (konsol + logger).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { KATALOG } = require('./ai-actions');
const perms = require('./ai-perms');
const { cozumle } = require('./ai-intent');

const ONAY_MS = 60 * 1000;
const bekleyenler = new Map(); // id -> { op, args, userId, guildId, channelId, lang, timer }

function opAdi(op, lang) {
  return t(lang, `mg.op.${op}`) === `mg.op.${op}` ? op : t(lang, `mg.op.${op}`);
}

function bekleyenEkle(op, args, ctx) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const timer = setTimeout(() => { bekleyenler.delete(id); }, ONAY_MS);
  bekleyenler.set(id, { op, args, userId: ctx.user.id, guildId: ctx.guild.id, channelId: ctx.channel.id, lang: ctx.lang, timer });
  return id;
}

function bekleyenAl(id) {
  const b = bekleyenler.get(id);
  if (b) {
    clearTimeout(b.timer);
    bekleyenler.delete(id);
  }
  return b || null;
}

function denetim(ctx, op, args, sonuc) {
  try {
    console.log(`AI-YONETIM ${ctx.guild.id}/${ctx.user.tag} ${op} ${JSON.stringify(args).slice(0, 300)} -> ${sonuc.ok ? 'OK' : 'HATA'}`);
  } catch {}
  // Denetim kanalı: sunucu ayarı -> LOG_CHANNEL_ID -> isim araması. Sessiz geçilir.
  try {
    const L = getLang(ctx.guild.id);
    const ozet = Object.entries(args || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ').slice(0, 1000) || '-';
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'mg.logBaslik'))
      .setColor(sonuc.ok ? 0x57F287 : 0xED4245)
      .addFields(
        { name: t(L, 'mg.logIslem'), value: `${opAdi(op, L)} (${op})`, inline: true },
        { name: t(L, 'mg.logSonuc'), value: sonuc.ok ? 'OK' : t(L, 'mg.logHata'), inline: true },
        { name: t(L, 'mg.logIsteyen'), value: `${ctx.user.tag} (${ctx.user.id})` },
        { name: t(L, 'mg.logParam'), value: ozet },
      )
      .setTimestamp();
    const kanal = denetimKanali(ctx.guild);
    if (kanal) kanal.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

function denetimKanali(guild) {
  try {
    const ozel = perms.getLogKanal(guild.id);
    if (ozel) {
      const c = guild.channels.cache.get(ozel);
      if (c && c.isTextBased()) return c;
    }
    const envId = (process.env.LOG_CHANNEL_ID || '').trim();
    if (envId) {
      const c = guild.channels.cache.get(envId);
      if (c && c.isTextBased()) return c;
    }
    return guild.channels.cache.find(c =>
      c.isTextBased() && ['ai-yonetim-log', 'yonetim-log', 'log', 'mod-log', 'ceza-log', 'kayıt'].some(n => (c.name || '').toLowerCase().includes(n))
    ) || null;
  } catch { return null; }
}

async function onaySor(gonder, ctx, op, args) {
  const id = bekleyenEkle(op, args, ctx);
  const L = ctx.lang;
  const ozet = Object.entries(args).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ayonay_${id}`).setLabel(t(L, 'mg.onayla')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ayred_${id}`).setLabel(t(L, 'mg.reddet')).setStyle(ButtonStyle.Secondary)
  );
  await gonder({ content: t(L, 'mg.onaySor', { op: opAdi(op, L), ozet }), components: [row] });
}

// Yönetim fiili çağrıştıran kelimeler (sadece HATA yolunda kullanılır:
// niyet çözümleme patlarsa ve soru buna benziyorsa sessiz sohbete düşmek
// yerine kısa hata gösterilir).
// NOT: 'grub' ayrıca yazılır; Türkçe ünsüz yumuşamasıyla grup->grubu/gruba
// olur ve 'grup' alt-dizgisi TUTMAZ ("grubu".includes("grup") === false)!
const YONETIM_KELIME = ['kanal', 'kategori', 'grup', 'grub', 'rol', 'rütbe', 'rutbe', 'sustur', 'timeout', 'mute', 'yasakla', 'ban', 'kick', 'uyar', 'warn', 'sayaç', 'sayac', 'counter', 'anket', 'poll', 'oylama', 'hatırlat', 'hatirlat', 'remind', 'oluştur', 'olustur', 'create', 'channel', 'category', 'group', 'role', 'delete', 'clear', 'temizle', 'sil'];

// Kısa anahtarlarla çakışan sıradan kelimeler (bana->ban, kontrol->rol):
// bunlar ayıklanır, kalan metinde arama yapılır.
const BLOKLU_KELIME = new Set(['bana', 'kontrol', 'parola', 'banka', 'asil', 'nesil', 'vasıf']);

function yonetimBenzeriMi(soru) {
  const ham = String(soru || '').toLowerCase();
  const temiz = ham.split(/[^a-zçğıöşü0-9]+/u).filter(w => w && !BLOKLU_KELIME.has(w)).join(' ');
  if (!temiz) return false;
  return YONETIM_KELIME.some(k => temiz.includes(k));
}

function iz(neden, ctx, ekstra) {
  try { console.log(`AI-YONETIM-IZ ${ctx.guild && ctx.guild.id}/${ctx.user && ctx.user.tag} ${neden}${ekstra ? ' ' + String(ekstra).slice(0, 160) : ''}`); } catch {}
}

// Son yönetim denemesi (teşhis için): guildId -> { t, asama, op }.
// /durum "Son deneme" alanından okunur; hangi aşamada takıldığı anlaşılır.
const sonDenemeler = new Map();
function denemeKaydet(guildId, asama, op) {
  try {
    if (!guildId) return;
    sonDenemeler.set(guildId, { t: Date.now(), asama: String(asama || '?'), op: op || null });
    if (sonDenemeler.size > 200) sonDenemeler.delete(sonDenemeler.keys().next().value);
  } catch {}
}
function sonDenemeAl(guildId) {
  try { return sonDenemeler.get(guildId) || null; } catch { return null; }
}

// Kural-tabanlı yedek niyet: ajan ıskalarsa ("GENERAL grubu aç" gibi açık
// durumlarda) deterministik eşleştirme yapar. SADECE düşük-riskli oluşturma
// işlemleri (kategori_ac, kanal_ac); karmaşık/şüpheli girdilerde null
// dönüp normal akışa (sohbet+not) bırakır.
const KURAL_STOP = new Set((
  'yeni bir tane adlı adında isimli lütfen bana bize için icin sunucuya sunucuda ve ile' +
  ' aç açar oluştur olustur create kur ekle kategori kategorisi kategori grup grubu gruba' +
  ' kanalı kanali kanal oraya buraya şuraya su bu o new a an the please server please'
).split(/\s+/));

function kuralAdCikar(soru) {
  const ham = String(soru || '');
  // 1) Tırnak içi: "Sohbet" adında kanal aç
  let m = ham.match(/["'“”]([^"'“”]{2,90})["'“”]/u);
  if (m) return m[1].trim();
  // 2) BÜYÜK HARFLİ token: GENERAL grubu aç
  m = ham.match(/\b[A-ZÇĞİÖŞÜ0-9]{2,}\b/u);
  if (m) return m[0];
  // 3) Stopword temizliği sonrası kalan: genel sohbet kanalı aç -> "genel sohbet"
  const kalan = ham.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2 && !KURAL_STOP.has(w));
  if (!kalan.length) return null;
  return kalan.slice(0, 3).join(' ');
}

function kuralNiyet(soru) {
  const ham = String(soru || '').toLocaleLowerCase('tr');
  if (!ham.trim()) return null;
  // Silme/kapatma kokuyorsa ASLA oluşturma yapma (ajan varken kural karışmasın)
  if (/(sil|kapat|kaldır|kaldir|delete|remove|temizle|clear)/i.test(ham)) return null;
  // Sayaç/anket/hatırlatıcı "kur" fiiliyle gelir; kanal sanılıp yanlış işlem yapılmasın
  if (/(sayaç|sayac|counter|anket|poll|oylama|hatırlat|hatirlat|remind)/i.test(ham)) return null;
  const olusturma = /(aç|oluştur|olustur|create|open|make|add|kur|ekle)/i.test(ham);
  if (!olusturma) return null;
  const ad = kuralAdCikar(soru);
  if (!ad) return null;
  // "kanal/oda" geçiyorsa kanal (tür: ses geçiyorsa ses), yoksa kategori.
  // ("GENERAL kanalı" -> kanal; "GENERAL grubu" -> kategori)
  if (/(kanal|oda|channel|room|chat|sohbet\s*odas)/i.test(ham)) {
    const tur = /(ses|voice)/i.test(ham) ? 'ses' : 'metin';
    return { op: 'kanal_ac', args: { ad, tur } };
  }
  // 'grub' ayrıca: grup->grubu/gruba yumuşamasında 'grup' tutmaz!
  if (/(kategori|category|categories|grup|grub|group|bölüm|bolum)/i.test(ham)) {
    return { op: 'kategori_ac', args: { ad } };
  }
  return null;
}

// ctx: { guild, channel, member, user, lang }
// gonder: (payload) => Promise (reply/send soyutlaması)
// bilgi (opsiyonel, {}): yönetim ele ALINMADAN sohbete düşülürse nedeni yazar:
//   { neden: 'dm'|'kapali'|'yetkisiz'|'anlasilamadi'|'hata', not: '<sohbete eklenecek not>' }.
// Çağıran bu notu sohbet sistem-promptuna eklerse model, yapılamayan isteği
// uydurma komutlarla (!, ?) geçiştiremez; dürüstçe açıklar.
async function yonetimAkis(ctx, soru, gonder, bilgi) {
  const L = ctx.lang;
  const not = (kod) => {
    try {
      if (bilgi && typeof bilgi === 'object' && kod) {
        bilgi.neden = kod;
        bilgi.not = t(L, 'mg.chatNotu', { neden: t(L, `mg.neden.${kod}`) });
      }
    } catch {}
  };
  try {
    if (!ctx.guild) { not('dm'); return false; }
    // Özellik kapalıysa temiz sohbet doğru davranıştır (not YOK).
    if (!perms.acikMi(ctx.guild.id)) { iz('kapali', ctx); return false; }
    if (!perms.kullanabilirMiYonetim(ctx.user, ctx.member, ctx.guild)) {
      // ID'lerle logla: Railway logundan kimin neden takıldığı anında görünsün
      // (OWNER_ID eşleşmiyor mu, sunucu sahibi mi değil?).
      try {
        iz('yetkisiz', ctx, `uid=${ctx.user && ctx.user.id} owner=${ctx.guild && ctx.guild.ownerId} kim=${perms.getKim(ctx.guild.id)}`);
      } catch { iz('yetkisiz', ctx); }
      try { denemeKaydet(ctx.guild.id, 'yetkisiz'); } catch {}
      not('yetkisiz');
      return false;
    }
    let niyet = null;
    try {
      niyet = await cozumle(soru, L, ctx.guild.id);
    } catch (e) {
      const msg = String((e && e.message) || '');
      const { sanitize } = require('./sanitize');
      const yedekBilgi = sanitize(String((e && e.yedekHata) || '')).slice(0, 200);
      if (e && e.code === 'LOCAL_UNREACHABLE' || /LOCAL_UNREACHABLE|fetch failed|timeout/i.test(msg)) {
        iz('yerel-erisilemiyor', ctx, msg);
        try { denemeKaydet(ctx.guild.id, 'yerel-erisilemiyor'); } catch {}
        await gonder({ content: t(L, 'mg.yerelKapali', { teknik: yedekBilgi || '?' }) }).catch(() => {});
        return true;
      }
      if (/401|403/.test(msg) || /NVIDIA_API_KEY/i.test(msg)) {
        iz('ajan-hata', ctx, msg);
        await gonder({ content: t(L, 'mg.ajanHata') }).catch(() => {});
        return true;
      }
      iz('niyet-hata', ctx, msg);
      // Model bulunamadı/yayından kalkmışsa (404/410) kullanıcıya net çözüm söyle.
      // Yerel model eksikse Ollama pull önerilir; NVIDIA modeli ölmüşse
      // (örn. kimi-k2 -> 410) ajan hatası gösterilir, pull önerilmez.
      if (/AI hatası \((404|410)\)|model.*not found|does not exist|not found/i.test(msg)) {
        let ajanNvidia = false;
        try { ajanNvidia = require('./ai-models').effectiveAgent(ctx.guild.id).kind === 'nvidia'; } catch {}
        await gonder({ content: t(L, ajanNvidia ? 'mg.ajanHata' : 'mg.modelYok') }).catch(() => {});
        return true;
      }
      // PC'de model patladıysa (500: genelde VRAM/OOM) net çözüm söyle
      if (/AI hatası \(5\d\d\)|out of memory|memory|unable to load/i.test(msg)) {
        await gonder({ content: t(L, 'mg.modelHata') }).catch(() => {});
        return true;
      }
      // Soru yönetime benziyorsa sessizliğe gömme, kısa hata göster
      // (teknik detay sanitize edilir; bot özeldir, kanalda görünmesi sorun değil)
      if (yonetimBenzeriMi(soru)) {
        await gonder({ content: t(L, 'mg.yonetimHata', { teknik: sanitize(msg).slice(0, 120) || '?' }) }).catch(() => {});
        return true;
      }
      // Yönetime benzemiyor -> temiz sohbet (not YOK, model özgür).
      return false;
    }
    // Yönetime benziyor ama ajan eşleştiremedi -> önce kural yedeği dene
    // ("GENERAL grubu aç" gibi açık durumlarda ajana muhtaç kalma).
    // Kural tutmazsa sohbete düşerken not bırak (uydurma komut engeli).
    if (!niyet || !niyet.op) {
      iz('eslesme-yok', ctx, soru);
      denemeKaydet(ctx.guild.id, 'eslesme-yok');
      const kural = kuralNiyet(soru);
      const girisK = kural && KATALOG[kural.op];
      if (girisK && girisK.risk === 'dusuk' && perms.isOpEnabled(kural.op, KATALOG)) {
        try {
          iz('kural-eslesme', ctx, `${kural.op} ${JSON.stringify(kural.args).slice(0, 120)}`);
          const sonucK = await girisK.run(ctx, kural.args);
          denetim(ctx, kural.op, kural.args, sonucK);
          denemeKaydet(ctx.guild.id, 'kural-ok', kural.op);
          await gonder({ content: sonucK.text }).catch(() => {});
          return true;
        } catch (eK) {
          iz('kural-hata', ctx, eK && eK.message);
        }
      }
      not('anlasilamadi');
      return false;
    }
    if (niyet.yedek) iz('yedek-ajan', ctx, niyet.yedek); // yerel patladı, NVIDIA yedek çözdü
    const giris = KATALOG[niyet.op];
    if (!giris || !perms.isOpEnabled(niyet.op, KATALOG)) {
      await gonder({ content: t(L, 'mg.islemKapali') }).catch(() => {});
      return true;
    }
    if (giris.risk === 'yuksek' && perms.needsApproval(niyet.op)) {
      await onaySor(gonder, ctx, niyet.op, niyet.args);
      return true;
    }
    const sonuc = await giris.run(ctx, niyet.args);
    denetim(ctx, niyet.op, niyet.args, sonuc);
    denemeKaydet(ctx.guild.id, 'ok', niyet.op);
    await gonder({ content: sonuc.text }).catch(() => {});
    return true;
  } catch (e) {
    iz('akis-hata', ctx, e && e.message);
    // Beklenmeyen patlama da sessiz sohbete gömülmesin: model dürüst açıklasın.
    try { denemeKaydet(ctx.guild && ctx.guild.id, 'hata'); } catch {}
    try { not('hata'); } catch {}
    return false;
  }
}

module.exports = { yonetimAkis, bekleyenAl, opAdi, denetim, yonetimBenzeriMi, kuralNiyet, kuralAdCikar, sonDenemeAl };
