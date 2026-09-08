const { EmbedBuilder } = require('discord.js');
const { kuyrugaEkle, siraBilgisi, uretimYap } = require('./ai');
const { sanitize, kullaniciMesaji } = require('./sanitize');

function durumEmbed(metin, modelAdi) {
  return new EmbedBuilder()
    .setDescription(metin)
    .setColor(0x5865F2)
    .setFooter({ text: `Model: ${modelAdi}` })
    .setTimestamp();
}

// Sıra göstergesi normal yazı değil: discord diff bloğu
function kuyrukMetni(sira, toplam) {
  return '```diff\n- Sıradasınız! Sıranız: ' + sira + '/' + toplam + '\n- Önünüzde ' + (sira - 1) + ' istek var\n```';
}

const ANIM = ['oluşturuluyor.', 'oluşturuluyor..', 'oluşturuluyor...'];
function animMetni(i) {
  return '```fix\n' + ANIM[i % ANIM.length] + '\n```';
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

// Cevabı kademeli gösterir: aynı mesajı düzenleyerek parça parça ekler.
// Embed açıklaması 4000 karakteri aşarsa ekGonder ile yeni mesajla devam eder.
async function kademeliGoster(mesaj, ekGonder, modelAdi, tamMetin) {
  const parcalar = cumlelereBol(tamMetin, 400);
  let gosterilen = '';
  let aktif = mesaj;
  for (const p of parcalar) {
    if ((gosterilen + p).length > 3900) {
      aktif = await ekGonder({ embeds: [durumEmbed(p, modelAdi)] });
      gosterilen = p;
    } else {
      gosterilen += p;
      await aktif.edit({ embeds: [durumEmbed(gosterilen, modelAdi)] });
    }
    await sleep(900);
  }
}

// Ortak akış: kuyruk takibi + animasyon + kademeli cevap.
// mesaj: düzenlenecek ilk mesaj (baslangic metni çağrıda gösterilmiş olmalı).
async function aiAkis({ mesaj, ekGonder, userId, userTag, model, yedek, soru, baslangic }) {
  const { jobId, sonuc } = kuyrugaEkle(userId, userTag, model.name, () =>
    uretimYap(model, yedek, [{ role: 'user', content: soru }])
  );
  let animI = 1;
  let sonMetin = baslangic || null;
  let bitti = false;
  const guncelle = async () => {
    try {
      const b = siraBilgisi(jobId);
      const metin = !b || b.sira <= 1 ? animMetni(animI++) : kuyrukMetni(b.sira, b.toplam);
      if (metin !== sonMetin) {
        sonMetin = metin;
        await mesaj.edit({ embeds: [durumEmbed(metin, model.name)] });
      }
    } catch {}
  };
  // Kısa beklemelerde sıra göstergesi yetişsin diye erken ilk kontrol
  await sleep(700);
  if (!bitti) await guncelle();
  const timer = setInterval(async () => { if (!bitti) await guncelle(); }, 2000);
  try {
    const { text, model: kullanilan, note } = await sonuc;
    bitti = true;
    clearInterval(timer);
    await kademeliGoster(mesaj, ekGonder, kullanilan.name, (note ? note + '\n\n' : '') + text);
  } catch (e) {
    bitti = true;
    clearInterval(timer);
    await mesaj.edit(kullaniciMesaji(e).slice(0, 2000)).catch(() => {});
  }
}

module.exports = { aiAkis, durumEmbed, kuyrukMetni, animMetni, cumlelereBol, kademeliGoster };
