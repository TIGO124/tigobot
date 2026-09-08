const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { load, save } = require('../store');
const { etiket } = require('../counter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sayac-kur')
    .setDescription('Üye sayısını gösteren ses kanalı açar')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const map = load('counter.json', {});
    const eski = map[interaction.guildId];
    if (eski) {
      const ch = interaction.guild.channels.cache.get(eski);
      if (ch) return interaction.reply({ content: `Sayaç zaten kurulu: ${ch}`, ephemeral: true });
    }
    try {
      const kanal = await interaction.guild.channels.create({
        name: etiket(interaction.guild.memberCount),
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }],
      });
      map[interaction.guildId] = kanal.id;
      save('counter.json', map);
      await interaction.reply(`Sayaç kuruldu: ${kanal} (kimse giremez, sadece sayı gösterir)`);
    } catch (e) {
      await interaction.reply({ content: `Sayaç kurulamadı: ${e.message}`, ephemeral: true });
    }
  },
};
