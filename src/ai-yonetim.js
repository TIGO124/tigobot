// AI yönetim akışı (orkestrasyon).
// Dönen değer: true = istek yönetimce ele alındı (yanıt verildi), false/null = normal sohbete düş.
// - DM'de yönetim yok (guild şart).
// - ai-perms: global/sunucu açık + kim-kullanır kontrolü.
// - Yüksek-risk + onay gerektiren işlem -> buton onayı (60 sn), yoksa direkt çalışır.
// - Her uygulama denetim loguna düşer (konsol + logger).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { KATALOG, sonKategoriAl } = require('./ai-actions');
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

// Kural-tabanlı niyet (dizi döner): açık oluşturma kalıplarında AJANDAN ÖNCE
// çalışır; deterministik, hızlı, kotasız. SADECE düşük-riskli oluşturma
// (kategori_ac, kanal_ac); karmaşık/şüpheli girdilerde [] dönüp ajana bırakır.
// Çoklu ad ("a, b ve c aç") ve üst-kategori ("X grubunun altına") destekler.
const KURAL_MAX_ISLEM = 5;
const KURAL_STOP = new Set((
  'yeni bir tane adlı adında isimli lütfen bana bize için icin sunucuya sunucuda ve ile' +
  ' aç açar oluştur olustur create kur ekle kategori kategorisi kategori grup grubu gruba' +
  ' kanalı kanali kanal oda odası odayı metin ses sesli yazılı yazili' +
  ' altına altina içine icine grubun grubunun kategorinin kategorisinin diye' +
  ' oraya buraya şuraya su bu o new a an the please server open make add'
).split(/\s+/).filter(Boolean));

// "X grubunun/kategorisinin altına" kalıbından X'i çıkarır (yoksa null).
// Öndeki zarflar atılır: "şimdi de o grubun altına" -> "o".
function kuralEbeveynHam(soru) {
  const m = String(soru || '').match(
    /([\p{L}\p{N}\s"'“”'-]{1,60}?)\s+(?:grubun|grubunun|kategorinin|kategorisinin|category\s+of)\s+(?:altına|altina|içine|icine|into|under)/iu
  );
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
function kuralAdlar(soru) {
  const ham = String(soru || '');
  const tirnak = ham.match(/["'“”]([^"'“”]{2,90})["'“”]/u);
  if (tirnak && tirnak[1].trim()) return [tirnak[1].trim()];
  // Ebeveyn cümleciğini at ("o grubun altına" kısımdaki isim adaya karışmasın)
  const govde = ham.replace(/^[\s\S]*?(?:altına|altina|içine|icine|into|under)\s+/iu, '');
  const parcalar = govde.split(/[,;]+|\s+ve\s+|\s+ile\s+/iu).map(s => s.trim()).filter(Boolean);
  const adlar = [];
  for (const p of parcalar) {
    const caps = p.match(/\b[A-ZÇĞİÖŞÜ0-9]{2,}\b/u);
    if (caps) { adlar.push(caps[0]); continue; }
    const temiz = p.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 2 && !KURAL_STOP.has(w)).slice(0, 3).join(' ');
    if (temiz) adlar.push(temiz);
  }
  return [...new Set(adlar)].slice(0, KURAL_MAX_ISLEM + 5);
}

function kuralNiyetler(soru, guild) {
  const ham = String(soru || '').toLocaleLowerCase('tr');
  if (!ham.trim()) return [];
  // Silme/kapatma kokuyorsa ASLA oluşturma yapma
  if (/(sil|kapat|kaldır|kaldir|delete|remove|temizle|clear)/i.test(ham)) return [];
  // Sayaç/anket/hatırlatıcı "kur" fiiliyle gelir; kanal sanılıp yanlış işlem yapılmasın
  if (/(sayaç|sayac|counter|anket|poll|oylama|hatırlat|hatirlat|remind)/i.test(ham)) return [];
  // Mastar kip ("açmayı düşünüyorum") varsayım değil; ajana bırak
  if (/(açmak|açmayı|oluşturmak|oluşturmayı|opening)/i.test(ham)) return [];
  if (!/(aç|oluştur|olustur|create|open|make|add|kur|ekle)/i.test(ham)) return [];
  const kanalMi = /(kanal|oda|channel|room|chat|sohbet\s*odas)/i.test(ham);
  // 'grub' ayrıca: grup->grubu/gruba yumuşamasında 'grup' tutmaz!
  const kategoriMi = /(kategori|category|categories|grup|grub|group|bölüm|bolum)/i.test(ham);
  if (!kanalMi && !kategoriMi) return [];
  const adlar = kuralAdlar(soru);
  if (!adlar.length) return [];
  const tur = /(ses|voice)/i.test(ham) ? 'ses' : 'metin';
  // "kanal/oda" geçiyorsa kanal (GENERAL kanalı), yoksa kategori (GENERAL grubu)
  if (kanalMi) {
    const ebAd = kuralEbeveynAd(guild, kuralEbeveynHam(soru));
    return adlar.map(ad => ({ op: 'kanal_ac', args: ebAd ? { ad, tur, ebeveyn: ebAd } : { ad, tur } }));
  }
  return adlar.map(ad => ({ op: 'kategori_ac', args: { ad } }));
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
    // KURAL ÖNCE: açık oluşturma kalıplarında ajana sormadan yap
    // (deterministik, hızlı, kotasız). Kural tutmazsa ajan dener.
    const kurallar = kuralNiyetler(soru, ctx.guild);
    if (kurallar.length) {
      const gecerli = kurallar.filter(k => {
        const g = KATALOG[k.op];
        return g && g.risk === 'dusuk' && perms.isOpEnabled(k.op, KATALOG);
      });
      if (gecerli.length) {
        const yapilacak = gecerli.slice(0, KURAL_MAX_ISLEM);
        const atlanan = gecerli.length - yapilacak.length;
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
    // Ajan da eşleştiremedi -> sohbete düşerken not bırak:
    // model "nasıl yapılır"ı başka botların komutlarıyla uydurmasın.
    if (!niyet || !niyet.op) {
      iz('eslesme-yok', ctx, soru);
      denemeKaydet(ctx.guild.id, 'eslesme-yok');
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

module.exports = { yonetimAkis, bekleyenAl, opAdi, denetim, yonetimBenzeriMi, kuralNiyetler, kuralEbeveynHam, kuralAdlar, KURAL_MAX_ISLEM, sonDenemeAl };
