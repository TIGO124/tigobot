const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.guild) return;
    // Yetkilileri atla
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const content = message.content.toLowerCase();
    const hasBanned = config.bannedWords.some(w => content.includes(w.toLowerCase()));
    const hasInvite = config.blockInvites && config.inviteRegex.test(message.content);

    if (hasBanned || hasInvite) {
      try { await message.delete(); } catch {}
      try {
        const warn = await message.channel.send(`${message.author}, ⚠️ Bu tür mesajlar bu sunucuda yasak!`);
        setTimeout(() => warn.delete().catch(() => {}), 5000);
      } catch {}
    }
  },
};
