const { Events, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { updateCounter } = require('../counter');
const { kullanabilirMi } = require('../owner');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // ÖZEL BOT KİLİDİ: karşılama mesajı + DM + oto-rol SADECE sahibe + beta-testerlara uygulanır.
    // Başkaları için bot hiçbir şey yapmaz (sayaç gibi tarafsız sunucu istatistiği hariç).
    let sahibeMi = false;
    try { sahibeMi = kullanabilirMi(member.user); } catch { sahibeMi = false; }
    if (!sahibeMi) {
      try { await updateCounter(member.guild); } catch {}
      return;
    }
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
      const L = getLang(member.guild.id);
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'welcome.title', { u: member.user.username }))
        .setDescription(t(L, 'welcome.body', { g: member.guild.name, n: member.guild.memberCount }))
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setColor(0x57F287)
        .setTimestamp();

      try {
        await channel.send({ content: `${member}`, embeds: [embed] });
      } catch {}
    }

    try {
      await member.send(t(getLang(member.guild.id), 'welcome.dm', { g: member.guild.name }));
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
