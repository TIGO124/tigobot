const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Tüm komutları listeler'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('TigoBot Yardım')
      .setColor(0x5865F2)
      .setDescription('Moderasyon + Karşılama botu komutları:')
      .addFields(
        { name: '/ping', value: 'Gecikmeyi gösterir', inline: true },
        { name: '/kullanici-bilgi', value: 'Kullanıcı bilgisi gösterir', inline: true },
        { name: '/clear', value: 'Mesaj siler (1-100)', inline: true },
        { name: '/warn', value: 'Üyeyi uyarır + loga yazar', inline: true },
        { name: '/timeout', value: 'Üyeyi susturur (dk)', inline: true },
        { name: '/kick', value: 'Üyeyi atar', inline: true },
        { name: '/ban', value: 'Üyeyi yasaklar', inline: true },
        { name: '/zar /yazi-tura /8ball', value: 'Eğlence', inline: true },
        { name: '/ask-olcer /espri', value: 'Eğlence', inline: true },
        { name: '/anket /hatirlatici', value: 'Araçlar', inline: true },
        { name: '/kanal-olustur /kategori-olustur /rol-olustur', value: 'Sunucu yönetimi', inline: true },
        { name: '/tepki-rol-kur /sayac-kur', value: 'Rol + sayaç kurulumu', inline: true },
        { name: '/ai /aimodels', value: 'Yapay zeka soru + model seçimi', inline: true },
        { name: '/durum', value: 'AI servis durumu', inline: true },
        { name: '/local', value: 'Yerel AI aç/kapat (sahip)', inline: true },
        { name: '/trust', value: 'Beklemeden muaf listesi (sahip)', inline: true },
      )
      .setFooter({ text: 'Otomatik: hoşgeldin mesajı + küfür/link filtresi + ismiyle seslenince cevap' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
