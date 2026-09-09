const { EmbedBuilder } = require('discord.js');
const { kuyrugaEkle, siraBilgisi, uretimYap, yerelHazirMi } = require('./ai');
const { sanitize, kullaniciMesaji } = require('./sanitize');
const { t, getLang, setLang } = require('./i18n');
const { detectLang } = require('./langdetect');
const { modelName } = require('./ai-models');
const { getHistory, pushHistory, MAX_TUR } = require('./memory');

function durumEmbed(metin, modelAdi, lang) {
  return new EmbedBuilder()
    .setDescription(metin)
    .setColor(0x5865F2)
    .setFooter({ text: t(lang, 'ai.modelTag', { m: modelAdi }) })
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

async function kademeliGoster(mesaj, ekGonder, modelAdi, lang, tamMetin) {
  const parcalar = cumlelereBol(tamMetin, 400);
  let gosterilen = '';
  let aktif = mesaj;
  for (const p of parcalar) {
    if ((gosterilen + p).length > 3900) {
      aktif = await ekGonder({ embeds: [durumEmbed(p, modelAdi, lang)] });
      gosterilen = p;
    } else {
      gosterilen += p;
      await aktif.edit({ embeds: [durumEmbed(gosterilen, modelAdi, lang)] });
    }
    await sleep(900);
  }
}

// Ortak akış: dil algılama + kuyruk takibi + animasyon + kademeli cevap.
async function aiAkis({ mesaj, ekGonder, userId, userTag, guildId, model, yedek, soru, baslangic }) {
  const taban = getLang(guildId);
  let lang = taban;
  // Kullanıcı varsayılan dilden farklı dilde yazdıysa dile geç (+ sunucuda kalıcı yap)
  const algi = detectLang(soru);
  if (algi && algi !== taban) {
    lang = algi;
    if (guildId) {
      setLang(guildId, algi);
      try {
        const { registerGuildCommands } = require('./schema');
        const client = mesaj.client;
        registerGuildCommands(guildId, algi, client).catch(() => {});
      } catch {}
    }
  }
  // Yerel seçiliyse önden erişim kontrolü: kapalıysa durum/animasyon
  // en baştan yedek modeli gösterir, cevapla tutarlı olur.
  let aktifModel = model;
  if (model.kind === 'local') {
    try {
      const h = await yerelHazirMi();
      if (!h.hazir) aktifModel = yedek;
    } catch {}
  }
  const { jobId, sonuc } = kuyrugaEkle(userId, userTag, modelName(aktifModel, lang), () => {
    // Sohbet hafızası: önceki turları bağlam olarak gönder
    const gecmis = getHistory(userId, guildId);
    return uretimYap(aktifModel, yedek, [...gecmis, { role: 'user', content: soru }], lang);
  });
  let animI = 1;
  let sonMetin = baslangic || null;
  let bitti = false;
  const guncelle = async () => {
    try {
      const b = siraBilgisi(jobId);
      const metin = !b || b.sira <= 1 ? animMetni(animI++, lang) : kuyrukMetni(b.sira, b.toplam, lang);
      if (metin !== sonMetin) {
        sonMetin = metin;
        await mesaj.edit({ embeds: [durumEmbed(metin, modelName(aktifModel, lang), lang)] });
      }
    } catch {}
  };
  await sleep(700);
  if (!bitti) await guncelle();
  const timer = setInterval(async () => { if (!bitti) await guncelle(); }, 2000);
  try {
    const res = await sonuc;
    bitti = true;
    clearInterval(timer);
    // Başarılı cevabı hafızaya yaz (sonraki sorularda bağlam olur)
    try { pushHistory(userId, guildId, soru, res.text); } catch {}
    await kademeliGoster(mesaj, ekGonder, modelName(res.model, lang), lang, (res.note ? res.note + '\n\n' : '') + res.text);
  } catch (e) {
    bitti = true;
    clearInterval(timer);
    await mesaj.edit(kullaniciMesaji(e, lang).slice(0, 2000)).catch(() => {});
  }
}

module.exports = { aiAkis, durumEmbed, kuyrukMetni, animMetni, cumlelereBol, kademeliGoster };
