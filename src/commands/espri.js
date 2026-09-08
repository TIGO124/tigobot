const { SlashCommandBuilder } = require('discord.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// k: konuşan, s: söz | t: anlatıcı satırı
const espriler = [
  [
    { t: 'Temel ile Dursun konuşuyormuş.' },
    { k: 'Temel', s: 'Dursun, seninle bir sır paylaşacağım.' },
    { k: 'Dursun', s: 'Söyle.' },
    { k: 'Temel', s: 'Ben aslında sır tutamıyorum.' },
  ],
  [
    { k: 'Öğretmen', s: 'Çocuklar, en hızlı hayvan nedir?' },
    { k: 'Öğrenci', s: 'Öğretmenim, ödevini yapmayan öğrenci. Zil çalınca ışık hızıyla kaçar.' },
  ],
  [
    { k: 'Müşteri', s: 'Garson, çorbamda sinek var!' },
    { k: 'Garson', s: 'Merak etmeyin efendim, o cankurtaran. Diğerleri boğulmasın diye.' },
  ],
  [
    { t: 'Adamın biri doktora gitmiş.' },
    { k: 'Adam', s: 'Doktor, her şeyi unutuyorum.' },
    { k: 'Doktor', s: 'Ne zamandır böyle?' },
    { k: 'Adam', s: 'Ne ne zamandır?' },
  ],
  [
    { t: 'İki balık konuşuyormuş.' },
    { k: 'Balık 1', s: 'Su içelim mi?' },
    { k: 'Balık 2', s: 'Saçmalama, boğuluruz.' },
  ],
  [
    { k: 'Komşu', s: 'İnternetiniz var mı?' },
    { k: 'Temel', s: 'Yok, bizde her şey doğal. Çocuklar bile dışarıda oynuyor.' },
  ],
  [
    { k: 'Öğrenci', s: 'Öğretmenim, kopya çekenin cezası ne?' },
    { k: 'Öğretmen', s: 'Sıfır.' },
    { k: 'Öğrenci', s: 'Oh, en azından bir şey alıyoruz.' },
  ],
  [
    { t: 'Adam bara girmiş, barmen sormuş.' },
    { k: 'Barmen', s: 'Ne alırsınız?' },
    { k: 'Adam', s: 'Cesaret. Patronumla konuşmam lazım.' },
  ],
  [
    { k: 'Anne', s: 'Oğlum, odanı topla.' },
    { k: 'Oğul', s: 'Anne, ben minimalizm akımına katıldım. Dağınıklık sanattır.' },
  ],
  [
    { t: 'İki programcı konuşuyormuş.' },
    { k: 'Programcı 1', s: 'Kodum çalışmıyor.' },
    { k: 'Programcı 2', s: 'Hiç mi çalışmıyor?' },
    { k: 'Programcı 1', s: 'Hayır, o kadar iyi yazmışım ki hata bile vermiyor. Sadece çalışmıyor.' },
  ],
];

function satir(x) {
  if (x.k) return `**${x.k}:** ${x.s}`;
  return `*${x.t}*`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('espri')
    .setDescription('Rastgele bir espri yapar'),
  async execute(interaction) {
    const espri = espriler[Math.floor(Math.random() * espriler.length)];
    const satirlar = espri.map(satir);
    const msg = await interaction.reply({ content: satirlar[0], fetchReply: true });
    for (let i = 1; i < satirlar.length; i++) {
      // Son replik (espri noktası) biraz daha bekletilir
      await sleep(i === satirlar.length - 1 ? 1600 : 1100);
      try {
        await msg.edit(satirlar.slice(0, i + 1).join('\n'));
      } catch {
        break;
      }
    }
  },
  // Test için dışa açık
  _satirlar: () => espriler.map(e => e.map(satir).join('\n')),
};
