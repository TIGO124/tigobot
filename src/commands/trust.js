const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { liste, guvenEkle, guvenKaldir } = require('../trust');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trust')
    .setDescription('AI bekleme süresinden muaf kullanıcıları yönetir (sadece sunucu sahibi)')
    .addSubcommand(s => s.setName('ekle').setDescription('Kullanıcıyı muaf listesine ekler')
      .addUserOption(o => o.setName('kullanici').setDescription('Muaf olacak kişi').setRequired(true)))
    .addSubcommand(s => s.setName('kaldir').setDescription('Kullanıcıyı muaf listesinden çıkarır')
      .addUserOption(o => o.setName('kullanici').setDescription('Kaldırılacak kişi').setRequired(true)))
    .addSubcommand(s => s.setName('liste').setDescription('Muaf listesini gösterir'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'Bu komutu sadece sunucu sahibi kullanabilir.', ephemeral: true });
    }
    const alt = interaction.options.getSubcommand();
    if (alt === 'liste') {
      const ids = liste(interaction.guildId);
      if (!ids.length) return interaction.reply({ content: 'Muaf listesi boş. `/trust ekle` ile ekleyebilirsin.', ephemeral: true });
      const adlar = ids.map(id => {
        const m = interaction.guild.members.cache.get(id);
        return m ? m.user.tag : id;
      });
      return interaction.reply({ content: `Muaf kullanıcılar (${adlar.length}):\n${adlar.join('\n')}`, ephemeral: true });
    }
    const kisi = interaction.options.getUser('kullanici');
    if (kisi.id === interaction.guild.ownerId) {
      return interaction.reply({ content: 'Sunucu sahibi zaten muaf.', ephemeral: true });
    }
    if (kisi.bot) {
      return interaction.reply({ content: 'Botlara gerek yok.', ephemeral: true });
    }
    if (alt === 'ekle') {
      if (!guvenEkle(interaction.guildId, kisi.id)) {
        return interaction.reply({ content: `${kisi.tag} zaten listede.`, ephemeral: true });
      }
      return interaction.reply({ content: `${kisi.tag} muaf listesine eklendi. Artık bekleme süresine takılmaz.`, ephemeral: true });
    }
    if (!guvenKaldir(interaction.guildId, kisi.id)) {
      return interaction.reply({ content: `${kisi.tag} zaten listede değil.`, ephemeral: true });
    }
    return interaction.reply({ content: `${kisi.tag} muaf listesinden çıkarıldı.`, ephemeral: true });
  },
};
