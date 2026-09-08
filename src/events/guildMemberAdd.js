const { Events, EmbedBuilder } = require('discord.js');
const { updateCounter } = require('../counter');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const welcomeId = process.env.WELCOME_CHANNEL_ID;
    let channel = welcomeId ? member.guild.channels.cache.get(welcomeId) : null;

    if (!channel) {
      channel = member.guild.channels.cache.find(c =>
        c.isTextBased() &&
        ['hosgeldin', 'hoşgeldin', 'hos-geldin', 'welcome', 'gelen-giden', 'genel'].some(n => c.name.toLowerCase().includes(n))
      );
    }
    if (!channel) channel = member.guild.systemChannel;

    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`Hoş geldin, ${member.user.username}!`)
        .setDescription(`**${member.guild.name}** sunucusuna katıldın!\n\nKuralları okumayı unutma.\nSohbete katılmak için kendini tanıt.\n\nŞu an **${member.guild.memberCount}** kişiyiz!`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setColor(0x57F287)
        .setTimestamp();

      try {
        await channel.send({ content: `${member}`, embeds: [embed] });
      } catch {}
    }

    try {
      await member.send(`**${member.guild.name}** sunucusuna hoş geldin!\nKuralları okuyup keyifli sohbetler dileriz.`);
    } catch {}

    // Oto-rol (.env içinde AUTO_ROLE_ID varsa)
    if (process.env.AUTO_ROLE_ID) {
      try {
        await member.roles.add(process.env.AUTO_ROLE_ID);
      } catch {}
    }

    await updateCounter(member.guild);
  },
};
