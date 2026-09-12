const { Events } = require('discord.js');

// Kanal Discord'dan elle silinirse sohbet.json'daki ölü kayıt temizlenir
// (panelde hayalet sohbet kalmasın).
module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    try {
      if (channel && channel.id) require('../sohbet').kaldir(channel.id);
    } catch {}
  },
};
