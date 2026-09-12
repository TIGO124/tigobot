// AI yönetim akışı (orkestrasyon).
// Dönen değer: true = istek yönetimce ele alındı (yanıt verildi), false/null = normal sohbete düş.
// - DM'de yönetim yok (guild şart).
// - ai-perms: global/sunucu açık + kim-kullanır kontrolü.
// - Yüksek-risk + onay gerektiren işlem -> buton onayı (60 sn), yoksa direkt çalışır.
// - Her uygulama denetim loguna düşer (konsol + logger).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { pingKir, clip } = require('./sanitize');
const { argDogrula } = require('./ai-intent');
const { KATALOG, sonKategoriAl } = require('./ai-actions');
const perms = require('./ai-perms');
const { cozumle } = require('./ai-intent');

const ONAY_MS = 60 * 1000;
const BEKLEYEN_MAX = 100;
const bekleyenler = new Map(); // id -> { plan|op, args, userId, guildId, channelId, lang, timer }

// Bellek şişmesin: en fazla BEKLEYEN_MAX onay (en eski düşer, timer temizlenir).
function bekleyenTahliye() {
  try {
    if (bekleyenler.size >= BEKLEYEN_MAX) {
      const ilk = bekleyenler.keys().next().value;
      const eski = bekleyenler.get(ilk);
      try { clearTimeout(eski && eski.timer); } catch {}
      bekleyenler.delete(ilk);
    }
  } catch {}
}

function opAdi(op, lang) {
  return t(lang, `mg.op.${op}`) === `mg.op.${op}` ? op : t(lang, `mg.op.${op}`);
}

function bekleyenEkle(op, args, ctx) {
  bekleyenTahliye();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const timer = setTimeout(() => { bekleyenler.delete(id); }, ONAY_MS);
  bekleyenler.set(id, { op, args, userId: ctx.user.id, userTag: ctx.user.tag, guildId: ctx.guild.id, channelId: ctx.channel.id, lang: ctx.lang, timer });
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

function denetim(ctx, op, args, sonuc, ekstra) {
  try {
    console.log(`AI-YONETIM ${ctx.guild.id}/${ctx.user.tag} ${op} ${JSON.stringify(args).slice(0, 300)} -> ${sonuc.ok ? 'OK' : 'HATA'}${ekstra ? ` (${ekstra})` : ''}`);
  } catch {}
  // Denetim kanalı: sunucu ayarı -> LOG_CHANNEL_ID -> isim araması. Sessiz geçilir.
  try {
    const L = getLang(ctx.guild.id);
    const ozet = clip(pingKir(Object.entries(args || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')), 900) || '-';
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'mg.logBaslik'))
      .setColor(sonuc.ok ? 0x57F287 : 0xED4245)
      .addFields(
        { name: t(L, 'mg.logIslem'), value: `${opAdi(op, L)} (${op})`, inline: true },
        { name: t(L, 'mg.logSonuc'), value: sonuc.ok ? 'OK' : t(L, 'mg.logHata'), inline: true },
        { name: t(L, 'mg.logIsteyen'), value: clip(`${ctx.user.tag} (${ctx.user.id})${ekstra ? `\n${ekstra}` : ''}`, 900) },
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

function bekleyenEklePlan(plan, ctx) {
  bekleyenTahliye();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const timer = setTimeout(() => { bekleyenler.delete(id); }, ONAY_MS);
  bekleyenler.set(id, { plan, userId: ctx.user.id, userTag: ctx.user.tag, guildId: ctx.guild.id, channelId: ctx.channel.id, lang: ctx.lang, timer });
  return id;
}

function planOzeti(plan, lang, maxAdim = 10) {
  const satirlar = plan.slice(0, maxAdim).map((p, i) => {
    const ozet = pingKir(Object.entries(p.args || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | '));
    return `${i + 1}. ${opAdi(p.op, lang)}${ozet ? ` (${clip(ozet, 120)})` : ''}`;
  });
  if (plan.length > maxAdim) satirlar.push(`…(+${plan.length - maxAdim})`);
  return satirlar.join('\n');
}

async function onaySorPlan(gonder, ctx, plan) {
  const id = bekleyenEklePlan(plan, ctx);
  const L = ctx.lang;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ayonay_${id}`).setLabel(t(L, 'mg.onayla')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ayred_${id}`).setLabel(t(L, 'mg.reddet')).setStyle(ButtonStyle.Secondary)
  );
  await gonder({ content: t(L, 'mg.onayPlan', { n: plan.length, ozet: planOzeti(plan, L) }).slice(0, 2000), components: [row] });
}

async function onaySor(gonder, ctx, op, args) {
  const id = bekleyenEkle(op, args, ctx);
  const L = ctx.lang;
  const ozet = Object.entries(args).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ayonay_${id}`).setLabel(t(L, 'mg.onayla')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ayred_${id}`).setLabel(t(L, 'mg.reddet')).setStyle(ButtonStyle.Secondary)
  );
  await gonder({ content: pingKir(t(L, 'mg.onaySor', { op: opAdi(op, L), ozet: clip(ozet, 1500) })).slice(0, 2000), components: [row] });
}

// Yönetim fiili çağrıştıran kelimeler (sadece HATA yolunda kullanılır:
// niyet çözümleme patlarsa ve soru buna benziyorsa sessiz sohbete düşmek
// yerine kısa hata gösterilir).
// NOT: 'grub' ayrıca yazılır; Türkçe ünsüz yumuşamasıyla grup->grubu/gruba
// olur ve 'grup' alt-dizgisi TUTMAZ ("grubu".includes("grup") === false)!
const YONETIM_KELIME = ['kanal', 'kategori', 'grup', 'grub', 'rol', 'rütbe', 'rutbe', 'sustur', 'timeout', 'mute', 'yasakla', 'ban', 'kick', 'uyar', 'warn', 'sayaç', 'sayac', 'counter', 'anket', 'poll', 'oylama', 'hatırlat', 'hatirlat', 'remind', 'oluştur', 'olustur', 'create', 'channel', 'category', 'group', 'role', 'delete', 'clear', 'temizle', 'sil', 'kapat', 'kov', 'nick', 'takma', 'sabitle', 'yayınla', 'yayinla', 'publish', 'yavas', 'yavaş', 'slowmode', 'emoji', 'sunucu', 'server', 'doğrulama', 'dogrulama', 'verification', 'sablon', 'şablon', 'template', 'yedek', 'backup', 'etkinli', 'event', 'sohbet', 'chat', 'oda', 'room', 'sıra', 'sira', 'sırasıyla', 'sirasiyla', 'sırala', 'sirala', 'yanlış', 'yanlis', 'düzelt', 'duzelt', 'düzenle', 'duzenle', 'değiştir', 'degistir', 'taşı', 'tasi', 'move', 'edit', 'izin', 'yetki', 'renk', 'davet', 'invite', 'konu', 'topic', 'yapma', 'tekrar', 'olmamış', 'olmamis', 'aç', 'ac'];

// Kısa anahtarlarla çakışan sıradan kelimeler (bana->ban, kontrol->rol):
// bunlar ayıklanır, kalan metinde arama yapılır.
const BLOKLU_KELIME = new Set(['bana', 'kontrol', 'parola', 'banka', 'asil', 'nesil', 'vasıf']);

// Kısa fiiller substring aranamaz ("at" -> kat/sat/hatırla patlar):
// bunlar SADECE tam kelimeyse yönetim sayılır.
const YONETIM_KELIME_TAM = new Set(['at', 'aç', 'ac', 'kapat', 'sil', 'kur', 'ekle', 'yap']);

function yonetimBenzeriMi(soru) {
  const ham = String(soru || '').toLowerCase();
  const kelimeler = ham.split(/[^a-zçğıöşü0-9]+/u).filter(w => w && !BLOKLU_KELIME.has(w));
  if (!kelimeler.length) return false;
  if (kelimeler.some(w => YONETIM_KELIME_TAM.has(w))) return true;
  const temiz = kelimeler.join(' ');
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

// Son yönetim isteği (lonca başına): tip-düzeltmeler
// ("grub demiştim" -> önceki adı kategori olarak dene) için 5 dk saklanır.
const sonIstekler = new Map();
const SON_ISTEK_MS = 5 * 60 * 1000;
function sonIstekKaydet(guildId, op, args) {
  try {
    if (!guildId || !op || !args || !args.ad) return;
    sonIstekler.set(guildId, { op, args: { ...args }, t: Date.now() });
    if (sonIstekler.size > 200) sonIstekler.delete(sonIstekler.keys().next().value);
  } catch {}
}
function sonIstekAl(guildId) {
  try {
    const k = sonIstekler.get(guildId);
    if (!k) return null;
    if (Date.now() - k.t > SON_ISTEK_MS) { sonIstekler.delete(guildId); return null; }
    return k;
  } catch { return null; }
}

// Tip düzeltmesi: "grub demiştim" / "kanal olacaktı" (fiilsiz geçmiş zaman).
// Dönüş: 'kategori' | 'kanal' | null.
function tipDuzeltme(soru) {
  const ham = String(soru || '').toLocaleLowerCase('tr');
  if (!/(demiştim|demiştin|demistim|dedim|olacaktı|olacakti|diyecektim)/i.test(ham)) return null;
  // İşaret sözcükleri soyulur ("olacaktı"daki "ac" fiil sanılmasın),
  // kalan çekirdekte gerçek fiil varsa düzeltme değildir.
  const cekirdek = ham
    .replace(/demiştim|demiştin|demistim|dedim|olacaktı|olacakti|diyecektim|tigobot/gi, ' ');
  if (/(sil|kapat|aç|oluştur|olustur|kur|ekle|kaldır|kaldir|düzenle|duzenle|değiştir|degistir)/i.test(cekirdek)) return null;
  if (/(kategori|grup|grub|group|category|bölüm|bolum)/i.test(ham)) return 'kategori';
  if (/(kanal|oda|channel|room)/i.test(ham)) return 'kanal';
  return null;
}
const TIP_ESLESME = { kanal_sil: 'kategori_sil', kategori_sil: 'kanal_sil', kanal_ac: 'kategori_ac', kategori_ac: 'kanal_ac' };

// Kural-tabanlı niyet (dizi döner): açık oluşturma kalıplarında AJANDAN ÖNCE
// çalışır; deterministik, hızlı, kotasız. SADECE düşük-riskli oluşturma
// (kategori_ac, kanal_ac); karmaşık/şüpheli girdilerde [] dönüp ajana bırakır.
// Çoklu ad ("a, b ve c aç") ve üst-kategori ("X grubunun altına") destekler.
const KURAL_MAX_ISLEM = 5;
const KURAL_STOP = new Set((
  'yeni bir tane adlı adında isimli lütfen lutfen bana bize seni sizi onu bunu şunu' +
  ' senden benden bizden sizden ondan bundan için icin sunucuya sunucuda ve ile' +
  ' şimdi simdi şimdide simdide şimdiki hadi bakalım bakim istiyorum istiyorsun istiyoruz istiyom' +
  ' aç ac açar acar oluştur olustur create kur ekle sil kapat kaldır kaldir delete remove kategori kategorisi kategori grup grubu gruba grubuna' +
  ' kanalı kanali kanal kanalını kanalına kanalında kanallar kanalları kanallarını kanallarına' +
  ' channels oda odası odayı odasını metin ses sesli yazılı yazili' +
  ' altına altina içine icine grub grubun grubunun kategorinin kategorisinin kategori kategoriye kategorisine gruba grubuna bölüm bolum bölümü bolumu diye olarak şekilde' +
  ' demiştim demiştin demistim dedim demek olacaktı olacaktı diyecektim' +
  ' açmanı acmani açmayı acmayi açmamı acmami yapmanı yapmayı yapmamı kurmanı oluşturmanı olusturmani' +
  ' açabilir acabilir açarmısın acarmisin yapar mısın misin musun müsün mı mi mu mü' +
  ' de da ki yi yı yu yü ye ya sırasıyla sirasıyla sırayla sirayla sırası sırasıyle tekrar yeniden düzelt duzelt yanlış yanlis yapmamışsın yapmamissin tigobot bot new a an the please server open make add to into under' +
  ' oraya buraya şuraya su bu o şu' +
  // Aralık/düzeltme artıkları: isme sızmamalı ("1 den 5 e kadar" -> den/kadar ad olmasın)
  ' den dan ten tan kadar arası arasi arasında arasinda hayır hayir yerine onu onun ondan bunu sunu şunu msil msin'
).split(/\s+/).filter(Boolean));

// "yonetim1 den yonetim 5 e kadar" / "yonetim 1-5" gibi aralıkları genişletir.
// Dönüş: ['yonetim1',...,'yonetim5'] ya da null (aralık yoksa).
// Kötüye kullanımı frenlemek için en fazla 10'lu aralık kabul edilir
// (üst sınır KURAL_MAX_ISLEM ile yonetimAkis'te uygulanır, fazlası "atlandı" notu alır).
function kuralAralikAdlar(metin) {
  const s = String(metin || '');
  // 1) "... den/dan ... (ye/ya/e/a) kadar" kalıbı
  let m = s.match(
    /([\p{L}_-]{2,})\s*(\d{1,3})\s*['’ʼ]?\s*(?:den|dan|ten|tan)\s+([\p{L}_-]{2,})?\s*(\d{1,3})\s*['’ʼ]?\s*(?:ye|ya|yene|yana|e|a)?\s*(?:e\s+|a\s+)?kadar/iu
  );
  let prefix1 = null; let n1 = null; let n2 = null;
  if (m) {
    prefix1 = (m[1] || '').trim();
    n1 = parseInt(m[2], 10);
    const prefix2 = (m[3] || '').trim();
    n2 = parseInt(m[4], 10);
    // İkinci önek varsa ve farklıysa aralık değildir ("elma1 den armut5 e kadar")
    if (prefix2 && prefix1.toLocaleLowerCase('tr') !== prefix2.toLocaleLowerCase('tr')) return null;
  } else {
    // 2) Kısa çizgi kalıbı: "yonetim1-5" / "yonetim 1 - 5" / "yonetim1-yonetim5"
    m = s.match(
      /([\p{L}_-]{2,})\s*(\d{1,3})\s*[-–—]\s*(?:([\p{L}_-]{2,})\s*)?(\d{1,3})\b/iu
    );
    if (!m) return null;
    prefix1 = (m[1] || '').trim();
    n1 = parseInt(m[2], 10);
    const prefix2 = (m[3] || '').trim();
    n2 = parseInt(m[4], 10);
    if (prefix2 && prefix1.toLocaleLowerCase('tr') !== prefix2.toLocaleLowerCase('tr')) return null;
  }
  if (!prefix1 || !Number.isFinite(n1) || !Number.isFinite(n2)) return null;
  if (n1 >= n2) return null;
  // Çok büyük aralık istismara/kazaya açıktır ("1 den 100 e kadar"):
  // ilk 10'luğa kırpılır, üst sınır (KURAL_MAX_ISLEM) yonetimAkis'te
  // "atlandı" notuyla uygulanır. Böylece çöp tekil ad üretilmez.
  if (n2 - n1 + 1 > 10) n2 = n1 + 9;
  const taban = prefix1.toLocaleLowerCase('tr');
  if (taban.length < 2) return null;
  const out = [];
  for (let i = n1; i <= n2; i++) out.push(`${taban}${i}`);
  return out;
}

// "X grubunun/kategorisinin altına" VEYA "X grubuna/kategorisine" kalıbından X'i çıkarır.
// Öndeki zarflar atılır: "şimdi de o grubun altına" -> "o", "şimdi bu gruba X aç" -> "bu".
function kuralEbeveynHam(soru) {
  const ham = String(soru || '');
  let m = ham.match(
    /([\p{L}\p{N}\s"'“”'-]{1,60}?)\s+(?:grubun|grubunun|kategorinin|kategorisinin|category\s+of)\s+(?:altına|altina|içine|icine|into|under)/iu
  );
  if (!m) {
    // "bu gruba X aç" / "UYARILAR grubuna X aç" (hedef belirtmeden grup içi oluşturma)
    m = ham.match(
      /([\p{L}\p{N}\s"'“”'-]{1,60}?)\s+(?:gruba|grubuna|kategoriye|kategorisine|group\s+to)\b/iu
    );
  }
  if (!m) return null;
  const kelimeler = m[1].trim().split(/\s+/).filter(Boolean);
  if (!kelimeler.length) return null;
  // Son kelime gönderme zamiriyse (o/bu/şu) tek başına odur; yoksa son 3 kelime addır.
  const son = kelimeler[kelimeler.length - 1].replace(/^["'“”]+|["'“”]+$/gu, '');
  if (/^(o|bu|şu|su|that|this)$/i.test(son)) return son;
  return kelimeler.slice(-3).join(' ');
}

// Üst-kategori ADINI çözer (run aşamasında ID'ye çevrilir).
// o/bu/şu göndermesi -> son açılan kategori; açık ad -> ada göre arama.
function kuralEbeveynAd(guild, ham) {
  if (!ham) return null;
  const duz = String(ham).replace(/^["'“”\s]+|["'“”\s]+$/gu, '').trim();
  if (!duz) return null;
  if (/^(o|bu|şu|su|that|this)$/i.test(duz)) {
    try {
      const son = sonKategoriAl(guild && guild.id);
      if (son && son.ad) return son.ad;
    } catch {}
    return null;
  }
  return duz.slice(0, 90);
}

// Ad listesi çıkarır: tırnaklı tek ad öncelikli, yoksa virgül/ve/ile bölünür.
// - "sohbet 3" / "uyarlar_3" gibi harf+sayı ayrımları korunur (sayı atılmaz).
// - "kanalını açmanı istiyorum", "diye metin kanalı aç" gibi fiil artıkları atılır.
// - Kullanıcının yazımı korunur (küçültme/slug run aşamasında yapılır).
function kuralAdlar(soru) {
  let ham = String(soru || '');
  // Baştaki bot hitabı atılır ("tigobot ...", "<@id> ...")
  ham = ham.replace(/^\s*(<@!?\d+>\s*|tigobot\b[,.!:\s]*)/iu, '').trim();
  // Tırnaklı tek ad ("\"sohbet odası\" aç") önceliklidir.
  // NOT: Türkçe kesme işareti tırnak değildir ("duyuru1'den duyuru3'e"):
  // tek tırnak ancak kelime-dışı komşularla gelirse tırnak sayılır,
  // yoksa "den duyuru3" gibi çöp ad üretiliyordu.
  let tirnak = ham.match(/["“”]([^"'“”]{2,90})["“”]/u);
  if (!tirnak) {
    const tek = ham.match(/(?:^|[\s:;,(\[])'([^'\n]{2,90})'(?=[\s:;,.)!\]?]|$)/u);
    if (tek) tirnak = tek;
  }
  if (tirnak && tirnak[1].trim()) return [tirnak[1].trim()];
  // Düzeltme kalıbı: "onu sil onun yerine X aç" -> sadece X tarafı ad olur.
  // ("yerine" öncesi silme pismanlığıdır, oluşturma adını kirletmesin.)
  if (/yerine|instead/iu.test(ham)) ham = String(ham.split(/yerine|instead/iu).pop() || '').trim();
  // Ebeveyn cümleciğini at ("o grubun altına" / "bu gruba" kısımdaki isim adaya karışmasın)
  const govde = ham
    .replace(/^[\s\S]*?(?:altına|altina|içine|icine|into|under)\s+/iu, '')
    .replace(/^[\s\S]*?\b(?:gruba|grubuna|kategoriye|kategorisine|group\s+to)\b\s+/iu, '');
  // Aralık önce: "yonetim1 den yonetim 5 e kadar" -> 5 ayrı ad.
  // (Normal kelime-bölme bu girdiyi tek ad yapıştırıyordu: "yonetim1-den-yonetim5".)
  try {
    const aralik = kuralAralikAdlar(govde);
    if (aralik && aralik.length) return [...new Set(aralik)].slice(0, KURAL_MAX_ISLEM + 5);
  } catch {}
  const parcalar = govde.split(/[,;]+|\s+ve\s+|\s+ile\s+|\s*\+\s*/iu).map(s => s.trim()).filter(Boolean);
  const adlar = [];
  for (let p of parcalar) {
    // Sondaki komut artığını kes: "X kanalını açmanı istiyorum" -> "X",
    // "GENERAL i sil" -> "GENERAL i" (silme fiilleri de artık sayılır).
    p = p.replace(/\s+(?:silin|sil|kapatın|kapat|kaldırın|kaldır|kaldir|delete|remove|temizle|clear)\b[\s\S]*$/iu, '')
      .replace(/\s+(?:sırasıyla|sirasıyla|sırayla|sirayla|tekrar|yeniden)\b[\s\S]*$/iu, '')
      .replace(/\s+(?:metin|ses|sesli|yazılı|yazili)\s+(?:kanalı|kanali|kanal|oda|odası|kanalları|kanallar)\b[\s\S]*$/iu, '')
      .replace(/\s+(?:kanalı|kanali|kanal|kanalını|kanalına|kanallar|kanalları|kanallarını|oda|odası|odasını|kategorisi|kategorisini|grubu|grubunu)\b[\s\S]*$/iu, '')
      .replace(/\s+(?:diye|adında|adinda|adlı|adli|isimli|olarak)\b[\s\S]*$/iu, '')
      .replace(/\s+(?:açmanı|açmayı|açmamı|yapmanı|yapmayı|aç|açın|oluştur|olustur|kur|ekle|yap|create|open|make|add)\b[\s\S]*$/iu, '')
      .trim();
    if (!p) continue;
    // "sohbet 3" -> "sohbet3" (sayı isme yapışır, sıra/numara kaybolmaz).
    // Alt çizgi/tire kullanıcının isteğidir, korunur ("uyarlar_3" aynı kalır).
    p = p.replace(/([\p{L}])\s+(\d{1,3})\b/gu, '$1$2');
    const caps = p.match(/\b[A-ZÇĞİÖŞÜ0-9_]{2,}\b/u);
    if (caps) { adlar.push(caps[0].replace(/\s+/g, '')); continue; }
    // Alt çizgi ismin parçasıdır (bölme): sadece harf-dışı (alt çizgi hariç) bölünür.
    const kelimeler = p.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}_]+/u)
      .filter(w => (w.length >= 2 || /^\d+$/.test(w)) && !KURAL_STOP.has(w));
    if (!kelimeler.length) continue;
    // Sayı önceki kelimeye yapışır ("sohbet","3" -> "sohbet3"), diğerleri boşlukla birleşir.
    let birlesik = '';
    for (const w of kelimeler.slice(0, 3)) {
      if (/^\d+$/.test(w) && birlesik) birlesik += w;
      else birlesik += (birlesik ? ' ' : '') + w;
    }
    if (birlesik) adlar.push(birlesik);
  }
  return [...new Set(adlar)].slice(0, KURAL_MAX_ISLEM + 5);
}

function kuralNiyetler(soru, guild, yerineModu = false) {
  const ham = String(soru || '').toLocaleLowerCase('tr');
  if (!ham.trim()) return [];
  // "onu sil onun yerine X aç" düzeltmesi oluşturmadır; silme guard'ına takılmasın.
  // (Ad çıkarımı "yerine" sonrasını kullanır, silinen taraf ajana bile gitmez.)
  // yerineModu: değiştirme dalından özyinelemeli çağrıda türsüz adlar kanal sayılır.
  const hamYerine = /yerine|instead/i.test(ham);
  const yerineDuzeltme = hamYerine || yerineModu === true;
  // NOT: "temizle/clear" (mesaj temizliği = mesaj_sil işi) bilerek YOK;
  // kanal silmeyle karışmasın diye ajana bırakılır.
  const silKokusu = /(sil|kapat|kaldır|kaldir|delete|remove)/i.test(ham);
  // Olumsuz emir ("kanalı silme" = silME!) asla silme yapmaz.
  if (/\b(silme|kapatma|silmesene|kapatmasana)\b/i.test(ham)) return [];
  // Değiştirme kalıbı: "GENERAL grubunu sil ve onun yerine SOHBET22 grubunu aç"
  // -> [sil(GENERAL), aç(SOHBET22)] iki niyet tek onayda.
  // ("onu sil onun yerine" pişmanlığında sol taraftan ad çıkmazsa sadece sağ taraf.)
  if (hamYerine && silKokusu) {
    const parcalarY = String(soru || '').split(/yerine|instead/iu);
    const sol = parcalarY[0] || '';
    const sag = parcalarY.slice(1).join(' ');
    const solAlt = sol.toLocaleLowerCase('tr');
    const solSil = /(sil|kapat|kaldır|kaldir|delete|remove)/i.test(solAlt)
      && !/\b(silme|kapatma|silmesene|kapatmasana)\b/i.test(sol)
      && !/(silmek|kapatmak|kaldırmak|deleting)/i.test(solAlt);
    const sagAc = /(aç|ac|oluştur|olustur|create|open|make|add|kur|ekle)/i.test(sag.toLocaleLowerCase('tr'));
    if (solSil && sagAc) {
      const solKanalMi = /(kanal|oda|channel|room|chat|sohbet\s*odas)/i.test(sol);
      const solKategoriMi = /(kategori|category|categories|grup|grub|group|bölüm|bolum)/i.test(sol);
      const silAdlar = kuralAdlar(sol);
      const sagNiyetler = kuralNiyetler(sag, guild, true);
      if (!silAdlar.length) return sagNiyetler;
      const silOp = (solKategoriMi && !solKanalMi) ? 'kategori_sil' : 'kanal_sil';
      return [...silAdlar.map(ad => ({ op: silOp, args: { ad } })), ...sagNiyetler];
    }
  }
  // Silme dalı: deterministik kural (ajan yokken de çalışır).
  // Mastar kip ("silmek istiyorum") varsayım değil; ajana bırak.
  if (silKokusu && !yerineDuzeltme) {
    if (/(silmek|kapatmak|kaldırmak|deleting)/i.test(ham)) return [];
    const kanalMiS = /(kanal|oda|channel|room|chat|sohbet\s*odas)/i.test(ham);
    const kategoriMiS = /(kategori|category|categories|grup|grub|group|bölüm|bolum)/i.test(ham);
    const adlarS = kuralAdlar(soru);
    if (!adlarS.length) return [];
    // Kategori sözü geçiyorsa kategori, yoksa kanal (kanal_sil kategoriyi reddeder).
    if (kategoriMiS && !kanalMiS) return adlarS.map(ad => ({ op: 'kategori_sil', args: { ad } }));
    return adlarS.map(ad => ({ op: 'kanal_sil', args: { ad } }));
  }
  // Silme/kapatma kokuyorsa ASLA oluşturma yapma (düzeltme hariç)
  if (!yerineDuzeltme && /(sil|kapat|kaldır|kaldir|delete|remove|temizle|clear)/i.test(ham)) return [];
  // Sayaç/anket/hatırlatıcı "kur" fiiliyle gelir; kanal sanılıp yanlış işlem yapılmasın
  if (/(sayaç|sayac|counter|anket|poll|oylama|hatırlat|hatirlat|remind)/i.test(ham)) return [];
  // Mastar kip ("açmayı düşünüyorum") varsayım değil; ajana bırak
  if (/(açmak|açmayı|oluşturmak|oluşturmayı|opening)/i.test(ham)) return [];
  // 'aç' alt-dizgisi tuzağı: kaç/araç/bekle/saç/sıcak/açlık yönetim değildir.
  // [] dönmek güvenlidir (ajan yedeği devralır, yanlış kanal açılmaz).
  if (/(kaç|kac|ara[cç]|bekle|sa[cç]|sıcak|sicak|a[cç]lık|ka[cç]ın)/i.test(ham)) return [];
  if (!/(aç|ac|oluştur|olustur|create|open|make|add|kur|ekle)/i.test(ham)) return [];
  const kanalMi = /(kanal|oda|channel|room|chat|sohbet\s*odas)/i.test(ham);
  // 'grub' ayrıca: grup->grubu/gruba yumuşamasında 'grup' tutmaz!
  const kategoriMi = /(kategori|category|categories|grup|grub|group|bölüm|bolum)/i.test(ham);
  // Düzeltmede tür adı düşer ("onun yerine yonetim1, yonetim2 aç"):
  // bağlam kanal olduğu için türsüz girdiyi kanal say (ajana bırakıp
  // tekil "Kanal bulunamadı" hatası vermekten iyidir).
  const kanalVarsay = yerineDuzeltme && !kanalMi && !kategoriMi;
  if (!kanalMi && !kategoriMi && !kanalVarsay) return [];
  const adlar = kuralAdlar(soru);
  if (!adlar.length) return [];
  const tur = /(ses|voice)/i.test(ham) ? 'ses' : 'metin';
  // "kanal/oda" geçiyorsa kanal (GENERAL kanalı), yoksa kategori (GENERAL grubu)
  if (kanalMi || kanalVarsay) {
    const ebAd = kuralEbeveynAd(guild, kuralEbeveynHam(soru));
    return adlar.map(ad => ({ op: 'kanal_ac', args: ebAd ? { ad, tur, ebeveyn: ebAd } : { ad, tur } }));
  }
  return adlar.map(ad => ({ op: 'kategori_ac', args: { ad } }));
}

// Kısmi member (APIInteractionGuildMember) roles/permissions taşımaz:
// tam üyeyi çek, olmazsa null (çağıran ayırt edilebilir hata verir).
async function uyeTamamla(guild, member, userId) {
  try {
    if (member && member.roles && member.roles.highest && member.permissions && typeof member.permissions.has === 'function') return member;
    if (!guild || !userId) return null;
    const tam = await guild.members.fetch(userId).catch(() => null);
    if (tam && tam.roles && tam.roles.highest) return tam;
    return null;
  } catch {
    return null;
  }
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
    // Kısmi üyeyi tamamla; olmazsa yanlış 'yetkisiz' yerine dürüst hata.
    try {
      const tam = await uyeTamamla(ctx.guild, ctx.member, ctx.user && ctx.user.id);
      if (tam) ctx.member = tam;
      else if (ctx.member) {
        try { denemeKaydet(ctx.guild.id, 'uye-tamamlanamadi'); } catch {}
        not('uyeYok');
        return false;
      }
    } catch {}
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
    // Tip düzeltmesi: önceki isteğin adını diğer tiple dene
    // ("GENERAL i sil" [kanal bulunamadı] -> "grub demiştim" [kategori dene]).
    // Onay kartı dahil normal borudan geçer (güvenlik aynen uygulanır).
    try {
      const duzTip = tipDuzeltme(soru);
      if (duzTip) {
        const son = sonIstekAl(ctx.guild.id);
        if (son && son.args && son.args.ad) {
          const aday = TIP_ESLESME[son.op] || null;
          const uygun = aday && ((duzTip === 'kategori' && aday.includes('kategori')) || (duzTip === 'kanal' && aday.includes('kanal')));
          if (uygun && perms.isOpEnabled(aday, KATALOG)) {
            const duzPlan = [{ op: aday, args: { ...son.args } }];
            sonIstekKaydet(ctx.guild.id, aday, duzPlan[0].args);
            try { denemeKaydet(ctx.guild.id, 'duzeltme', `${son.op}->${aday}`); } catch {}
            iz('tip-duzeltme', ctx, `${son.op}->${aday}:${JSON.stringify(duzPlan[0].args).slice(0, 120)}`);
            if (KATALOG[aday].risk === 'yuksek' && perms.needsApproval(aday)) {
              await onaySorPlan(gonder, ctx, duzPlan);
              return true;
            }
            const dMetinler = [];
            for (const adim of duzPlan) {
              try {
                const r = await KATALOG[adim.op].run(ctx, adim.args);
                denetim(ctx, adim.op, adim.args, r);
                dMetinler.push((r.ok ? '✓ ' : '✗ ') + clip(String(r.text || ''), 300));
              } catch (eK) {
                iz('duzeltme-hata', ctx, `${adim.op}: ${eK && eK.message}`);
                dMetinler.push('✗ ' + adim.op);
              }
            }
            await gonder({ content: dMetinler.join('\n').slice(0, 2000) }).catch(() => {});
            return true;
          }
        }
      }
    } catch {}
    // KURAL ÖNCE: açık kalıplarda ajana sormadan yap
    // (deterministik, hızlı, kotasız, ajan kapalıyken de çalışır).
    // Kural tutmazsa ajan dener.
    const kurallar = kuralNiyetler(soru, ctx.guild);
    if (kurallar.length) {
      const gecerli = kurallar.filter(k => {
        const g = KATALOG[k.op];
        return g && perms.isOpEnabled(k.op, KATALOG);
      });
      if (gecerli.length) {
        const yapilacak = gecerli.slice(0, KURAL_MAX_ISLEM);
        const atlanan = gecerli.length - yapilacak.length;
        // Yüksek-risk adım (örn. kural-silmeler) varsa TEK onay kartı:
        // oluşturma da silme de aynı borudan geçer.
        if (yapilacak.some(k => KATALOG[k.op].risk === 'yuksek' && perms.needsApproval(k.op))) {
          if (atlanan > 0) iz('kural-atlandi', ctx, String(atlanan));
          try { denemeKaydet(ctx.guild.id, 'kural-onay', yapilacak.map(k => k.op).join('+')); } catch {}
          sonIstekKaydet(ctx.guild.id, yapilacak[0].op, yapilacak[0].args);
          await onaySorPlan(gonder, ctx, yapilacak.map(k => ({ op: k.op, args: k.args })));
          return true;
        }
        sonIstekKaydet(ctx.guild.id, yapilacak[0].op, yapilacak[0].args);
        const metinler = [];
        for (const k of yapilacak) {
          try {
            const rK = await KATALOG[k.op].run(ctx, k.args);
            denetim(ctx, k.op, k.args, rK);
            metinler.push(rK.text);
          } catch (eK) {
            iz('kural-hata', ctx, eK && eK.message);
            metinler.push(t(L, 'err.generic'));
          }
        }
        if (atlanan > 0) metinler.push(t(L, 'mg.cokluAtlandi', { n: atlanan }));
        denemeKaydet(ctx.guild.id, 'kural-ok', yapilacak.map(k => k.op).join('+'));
        iz('kural-eslesme', ctx, yapilacak.map(k => `${k.op}:${JSON.stringify(k.args)}`).join(' | ').slice(0, 160));
        await gonder({ content: metinler.join('\n') }).catch(() => {});
        return true;
      }
    }
    let niyet = null;
    try {
      niyet = await cozumle(soru, L, ctx.guild.id);
    } catch (e) {
      const msg = String((e && e.message) || '');
      const { sanitize } = require('./sanitize');
      // Tam yedek dökümü loga; kanala sadece ilk satırın özeti (uzun 410
      // zincirleri kanalı çöplüğe çeviriyordu).
      const yedekHam = String((e && e.yedekHata) || '');
      try {
        if (yedekHam) console.error(`AI-YEDEK özet (${ctx.guild && ctx.guild.id}): ${sanitize(yedekHam).slice(0, 600)}`);
      } catch {}
      const yedekBilgi = sanitize(yedekHam.split(' | ')[0]).slice(0, 120);
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
    // Ajan da eşleştiremedi -> sohbete düşerken not bırak:
    // model "nasıl yapılır"ı başka botların komutlarıyla uydurmasın.
    const hamPlan = Array.isArray(niyet && niyet.plan) ? niyet.plan
      : (niyet && niyet.op ? [{ op: niyet.op, args: niyet.args }] : []);
    if (!hamPlan.length) {
      iz('eslesme-yok', ctx, soru);
      denemeKaydet(ctx.guild.id, 'eslesme-yok');
      not('anlasilamadi');
      return false;
    }
    if (niyet.yedek) iz('yedek-ajan', ctx, niyet.yedek); // yerel patladı, NVIDIA yedek çözdü
    // Planı doğrula: bilinmeyen/kapalı/argümanı bozuk adımlar elenir (en fazla 10).
    // Elenen sayısı rapora eklenir (sessiz eleme yok).
    const plan = [];
    let elenen = 0;
    for (const adim of hamPlan.slice(0, 10)) {
      if (!adim) { elenen++; continue; }
      const giris = KATALOG[adim.op];
      if (!giris || !perms.isOpEnabled(adim.op, KATALOG)) { elenen++; continue; }
      let duz = null;
      try {
        duz = argDogrula(adim.op, (adim.args && typeof adim.args === 'object') ? adim.args : {});
      } catch { duz = null; }
      if (!duz) { elenen++; continue; }
      plan.push({ op: adim.op, args: duz });
    }
    if (!plan.length) {
      await gonder({ content: t(L, 'mg.islemKapali') }).catch(() => {});
      return true;
    }
    // Yüksek-risk + onay gerektiren adım varsa TÜM plan tek onay kartında.
    if (plan.some(p => KATALOG[p.op].risk === 'yuksek' && perms.needsApproval(p.op))) {
      sonIstekKaydet(ctx.guild.id, plan[0].op, plan[0].args);
      await onaySorPlan(gonder, ctx, plan);
      return true;
    }
    sonIstekKaydet(ctx.guild.id, plan[0].op, plan[0].args);
    const metinler = [];
    for (const adim of plan) {
      try {
        const r = await KATALOG[adim.op].run(ctx, adim.args);
        denetim(ctx, adim.op, adim.args, r);
        metinler.push((r.ok ? '✓ ' : '✗ ') + clip(String(r.text || ''), 300));
      } catch (eK) {
        iz('plan-hata', ctx, `${adim.op}: ${eK && eK.message}`);
        metinler.push('✗ ' + adim.op);
      }
    }
    if (elenen > 0) metinler.push(t(L, 'mg.cokluAtlandi', { n: elenen }));
    denemeKaydet(ctx.guild.id, plan.length > 1 ? 'ok-plan' : 'ok', plan.map(p => p.op).join('+'));
    const birlesik = metinler.join('\n');
    await gonder({ content: birlesik.slice(0, 1900) + (birlesik.length > 1900 ? '\n' + t(L, 'mg.devamLogda') : '') }).catch(() => {});
    return true;
  } catch (e) {
    iz('akis-hata', ctx, e && e.message);
    // Beklenmeyen patlama da sessiz sohbete gömülmesin: model dürüst açıklasın.
    try { denemeKaydet(ctx.guild && ctx.guild.id, 'hata'); } catch {}
    try { not('hata'); } catch {}
    return false;
  }
}

module.exports = { yonetimAkis, bekleyenAl, opAdi, denetim, yonetimBenzeriMi, kuralNiyetler, kuralEbeveynHam, kuralAdlar, kuralAralikAdlar, KURAL_MAX_ISLEM, sonDenemeAl, uyeTamamla, tipDuzeltme, sonIstekKaydet, sonIstekAl };
