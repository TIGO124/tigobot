const { Events } = require('discord.js');
const { updateCounter } = require('../counter');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await updateCounter(member.guild);
  },
};
