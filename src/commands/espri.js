const { SlashCommandBuilder } = require('discord.js');

const espriler = [
  'Temel ile Dursun konuşuyormuş. Temel: "Dursun, seninle bir sır paylaşacağım." Dursun: "Söyle." Temel: "Ben aslında sır tutamıyorum."',
  'Öğretmen: "Çocuklar, en hızlı hayvan nedir?" Öğrenci: "Öğretmenim, ödevini yapmayan öğrenci. Zil çalınca ışık hızıyla kaçar."',
  'Müşteri: "Garson, çorbamda sinek var!" Garson: "Merak etmeyin efendim, o cankurtaran. Diğerleri boğulmasın diye."',
  'Adamın biri doktora gitmiş: "Doktor, her şeyi unutuyorum." Doktor: "Ne zamandır böyle?" Adam: "Ne ne zamandır?"',
  'İki balık konuşuyormuş. Biri: "Su içelim mi?" Diğeri: "Saçmalama, boğuluruz."',
  'Komşu: "İnternetiniz var mı?" Temel: "Yok, bizde her şey doğal. Çocuklar bile dışarıda oynuyor."',
  'Öğrenci: "Öğretmenim, kopya çekenin cezası ne?" Öğretmen: "Sıfır." Öğrenci: "Oh, en azından bir şey alıyoruz."',
  'Adam bara girmiş, barmen sormuş: "Ne alırsınız?" Adam: "Cesaret. Patronumla konuşmam lazım."',
  'Anne: "Oğlum, odanı topla." Oğul: "Anne, ben minimalizm akımına katıldım. Dağınıklık sanattır."',
  'İki programcı konuşuyormuş. Biri: "Kodum çalışmıyor." Diğeri: "Hiç mi çalışmıyor?" Biri: "Hayır, o kadar iyi yazmışım ki hata bile vermiyor. Sadece çalışmıyor."',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('espri')
    .setDescription('Rastgele bir espri yapar'),
  async execute(interaction) {
    const espri = espriler[Math.floor(Math.random() * espriler.length)];
    await interaction.reply(espri);
  },
};
