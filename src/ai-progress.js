const { EmbedBuilder } = require('discord.js');
const { kuyrugaEkle, uretimYap, yerelHazirMi } = require('./ai');
const { kullaniciMesaji, sanitize } = require('./sanitize');
const { t, getLang, setLang } = require('./i18n');
const { detectLang } = require('./langdetect');
const { pushHistory, gecmisteAra, MAX_TUR } = require('./memory');
const { addUsage } = require('./quota');
const { aramaGerekirMi, webAra } = require('./arama');

function durumEmbed(metin, lang) {
  // Model adı bilerek yazılmaz: aktif model sadece owner/panel tarafından bilinir.
  return new EmbedBuilder()
    .setDescription(metin)
    .setColor(0x5865F2)
    .setTimestamp();
}

// Sıra göstergesi normal yazı değil: discord diff bloğu
function kuyrukMetni(sira, toplam, lang) {
  return '```diff\n' + t(lang, 'ai.queue', { s: sira, t: toplam, o: sira - 1 }) + '\n```';
}

function animMetni(i, lang) {
  return '```fix\n' + t(lang, `ai.generating.${i % 3}`) + '\n```';
}

// Cümle sonlarından ~400 karakterlik parçalar
function cumlelereBol(text, max = 400) {
  const parts = [];
  let rest = text;
  const ayraclar = ['\n\n', '\n', '. ', '! ', '? ', ' '];
  while (rest.length > max) {
    let cut = -1;
    for (const sep of ayraclar) {
      const i = rest.lastIndexOf(sep, max);
      if (i > max * 0.3) { cut = i + sep.length; break; }
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function kademeliGoster(mesaj, ekGonder, lang, tamMetin) {
  const parcalar = cumlelereBol(tamMetin, 400);
  let gosterilen = '';
  let aktif = mesaj;
  for (const p of parcalar) {
    if ((gosterilen + p).length > 3900) {
      aktif = await ekGonder({ embeds: [durumEmbed(p, lang)] });
      gosterilen = p;
    } else {
      gosterilen += p;
      await aktif.edit({ embeds: [durumEmbed(gosterilen, lang)] });
    }
    await sleep(900);
  }
}

// Ortak akış: dil algılama + yazıyor-göstergesi + arama-bağlamı + renkli cevap.
// "Thinking" animasyon mesajı BİLEREK YOK: animasyon edit'i ile cevap edit'i
// yarışıp eski "oluşturuluyor…" metni cevabın üstüne yazılıyordu (takılı
// thinking bug'ı). Yerine Discord'un yerleşik "yazıyor..." göstergesi
// (sendTyping) kullanılır; arkada mesaj bırakmaz, eskir hale gelmez.
async function aiAkis({ ilkGonder, ekGonder, kanal, userId, userTag, guildId, model, yedek, soru, ekBaglam = '' }) {
  const taban = getLang(guildId);
  let lang = taban;
  // Kullanıcı varsayılan dilden farklı dilde yazdıysa dile geç (+ sunucuda kalıcı yap)
  const algi = detectLang(soru);
  if (algi && algi !== taban) {
    lang = algi;
    if (guildId) {
      // Kalıcı dil kaydı başarısız olursa (disk dolu/kilitli) sohbet ölmesin
      try {
        setLang(guildId, algi);
      } catch {}
      try {
        const { registerGuildCommands } = require('./schema');
        const client = kanal && kanal.client;
        if (client) registerGuildCommands(guildId, algi, client).catch(() => {});
      } catch {}
    }
  }
  // "Yazıyor..." hemen başlar: arama + kuyruk beklemesi boyunca kullanıcı
  // boşlukta kalmasın (özellikle arama 15 sn'ye kadar sürebilir).
  const typing = typingBaslat(kanal);
  let gonderildi = 0;
  // Yerel seçiliyse önden erişim kontrolü (hangi modelin cevaplayacağı bilgisi)
  let aktifModel = model;
  if (model.kind === 'local') {
    try {
      const h = await yerelHazirMi();
      if (!h.hazir) aktifModel = yedek;
    } catch {}
  }
  // İnternet gerekiyorsa Tavily'den taze bağlam çek.
  // Arama patlarsa (key yok/ağ/401/429) cevap aramasız devam eder;
  // neden Railway loguna düşer, kullanıcıya yansımaz.
  let ekstraSistem = '';
  try {
    if (aramaGerekirMi(soru)) {
      const not = await webAra(soru).catch((e) => {
        try { console.error('Arama atlandı:', sanitize((e && e.message) || e)); } catch {}
        return null;
      });
      if (not) ekstraSistem = not;
    }
  } catch {}
  // Soru metni: yanıt-bağlamı (reply referansı) varsa öne eklenir
  const soruMetni = ekBaglam ? `${ekBaglam}\n\nSoru: ${soru}` : soru;
  const { sonuc } = kuyrugaEkle(userId, userTag, aktifModel.key, () => {
    // Sohbet hafızası: alakalı turlar bağlam olarak gönderilir
    const gecmis = gecmisteAra(userId, guildId, soru);
    return uretimYap(aktifModel, yedek, [...gecmis, { role: 'user', content: soruMetni }], lang, ekstraSistem);
  });
  try {
    const res = await sonuc;
    // Başarılı cevabı hafızaya yaz (sonraki sorularda bağlam olur; ham soru saklanır)
    try { pushHistory(userId, guildId, soru, res.text); } catch {}
    // Token kotası: üretimden dönen token kullanımını işle
    try { if (res.usage > 0) addUsage(userId, res.usage); } catch {}
    // Yedek-not kullanıcıya gösterilmez (model kimliği gizli); loga düşer
    if (res.note) {
      try { console.log(`AI yedek model devreye girdi (${guildId || 'DM'}/${userTag}): ${res.note}`); } catch {}
    }
    gonderildi = await renkliGoster(ilkGonder, ekGonder, res.text);
  } catch (e) {
    const hata = kullaniciMesaji(e, lang).slice(0, 2000);
    try {
      if (!gonderildi) await ilkGonder(hata);
      else await ekGonder(hata);
    } catch {}
  } finally {
    clearInterval(typing);
  }
}

// "Yazıyor..." göstergesi: mesaj bırakmaz, 8 sn'de bir tazelenir.
function typingBaslat(kanal) {
  const tik = () => { try { if (kanal && typeof kanal.sendTyping === 'function') kanal.sendTyping().catch(() => {}); } catch {} };
  tik();
  return setInterval(tik, 8000);
}

const RENK = {
  varsayilan: 0x5865F2, // blurple: normal anlatım
  ornek: 0x57F287, // yeşil: örnekler
  kod: 0x9B59B6, // mor: kod blokları
  uyari: 0xFEE75C, // sarı: uyarı/not
};
const MAX_EMBED = 3900;

// Cevabı renkli bloklara ayırır: örnekler yeşil, kod mor, uyarı sarı.
function bloklaraAyir(text) {
  const ham = String(text || '');
  if (!ham.trim()) return [];
  // 1) Kod çitlerini ayır (içleri bölünmez)
  const hamParca = ham.split(/(```[\s\S]*?(?:```|$))/g).filter(s => s !== '');
  const bloklar = [];
  for (const p of hamParca) {
    if (p.startsWith('```')) {
      if (p.replace(/```/g, '').trim()) bloklar.push({ tur: 'kod', metin: p.trim() });
      continue;
    }
    // 2) Örnek/Uyarı satır başlarından böl
    const isaretli = p.split(/\n(?=(?:örnek|ornek|example|mesela|uyarı|uyari|not|dikkat|warning|note|önemli|onemli|important)\s*[:\-])/i);
    for (const q of isaretli) {
      for (const a of q.split(/\n{2,}/)) {
        const t2 = a.trim();
        if (t2) bloklar.push({ tur: sinifla(t2), metin: t2 });
      }
    }
  }
  // 3) Ardışık aynı renkleri birleştir (tek renk cümbüşü olmasın)
  const birlesik = [];
  for (const b of bloklar) {
    const son = birlesik[birlesik.length - 1];
    if (son && son.tur === b.tur && (son.metin.length + b.metin.length + 2) <= MAX_EMBED) {
      son.metin += '\n\n' + b.metin;
    } else if (b.metin.length > MAX_EMBED) {
      for (const c of cumlelereBol(b.metin, MAX_EMBED)) birlesik.push({ tur: b.tur, metin: c });
    } else {
      birlesik.push({ tur: b.tur, metin: b.metin });
    }
  }
  // 4) Güvenlik tavanı: en fazla 10 kutu (fazlası sondan birleşir).
  // Birleşen kutu limiti aşarsa tekrar bölünür (içerik ASLA kesilmez,
  // Discord 4096 sınırını send aşamasında da korur).
  while (birlesik.length > 10) {
    const son = birlesik.pop();
    birlesik[birlesik.length - 1].metin += '\n\n' + son.metin;
  }
  const duzgun = [];
  for (const b of birlesik) {
    if (b.metin.length > MAX_EMBED) {
      for (const c of cumlelereBol(b.metin, MAX_EMBED)) duzgun.push({ tur: b.tur, metin: c });
    } else {
      duzgun.push(b);
    }
  }
  return duzgun.filter(b => b.metin && b.metin.trim());
}

function sinifla(t2) {
  if (/^(örnek|ornek|example|mesela|for\s+example)\s*[:\-]/i.test(t2)) return 'ornek';
  if (/^(uyarı|uyari|not|dikkat|warning|note|önemli|onemli|important)\s*[:\-]/i.test(t2)) return 'uyari';
  return 'varsayilan';
}

// Renkli blokları gönderir: ilk blok ilkGonder ile (yanıt/edit),
// devamı ekGonder ile. Gönderilen kutu sayısını döner.
async function renkliGoster(ilkGonder, ekGonder, tamMetin) {
  const bloklar = bloklaraAyir(tamMetin);
  if (!bloklar.length) {
    await ilkGonder(String(tamMetin || '').slice(0, 2000));
    return 1;
  }
  let n = 0;
  for (const b of bloklar) {
    const embed = new EmbedBuilder()
      .setDescription(b.metin.slice(0, 4096))
      .setColor(RENK[b.tur] || RENK.varsayilan)
      .setTimestamp();
    if (n === 0) await ilkGonder({ embeds: [embed] });
    else {
      await ekGonder({ embeds: [embed] });
      await sleep(600); // kanal hız limitine takılmamak için
    }
    n++;
  }
  return n;
}

module.exports = { aiAkis, durumEmbed, kuyrukMetni, animMetni, cumlelereBol, kademeliGoster, bloklaraAyir, renkliGoster, RENK };
