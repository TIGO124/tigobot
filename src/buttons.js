const { EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { load, save } = require('./store');
const { anketEmbed } = require('./commands/anket');

async function handle(interaction) {
  const L = getLang(interaction.guildId);
  const id = interaction.customId;

  // Tepki-rol: rr_<rolId>
  if (id.startsWith('rr_')) {
    const rolId = id.slice(3);
    const rol = interaction.guild.roles.cache.get(rolId);
    if (!rol) return interaction.reply({ content: t(L, 'rr.norole'), ephemeral: true });
    try {
      if (interaction.member.roles.cache.has(rolId)) {
        await interaction.member.roles.remove(rolId);
        return interaction.reply({ content: t(L, 'rr.removed', { r: rol.name }), ephemeral: true });
      }
      await interaction.member.roles.add(rolId);
      return interaction.reply({ content: t(L, 'rr.added', { r: rol.name }), ephemeral: true });
    } catch {
      return interaction.reply({ content: t(L, 'rr.fail'), ephemeral: true });
    }
  }

  // Anket oyu: anket_<pollId>_<index>
  if (id.startsWith('anket_')) {
    const [, pollId, idxStr] = id.split('_');
    const idx = Number(idxStr);
    const polls = load('ankets.json', {});
    const poll = polls[pollId];
    if (!poll || !poll.secenekler[idx]) {
      return interaction.reply({ content: t(L, 'poll.gone'), ephemeral: true });
    }
    const onceki = poll.voters[interaction.user.id];
    if (onceki === idx) {
      delete poll.voters[interaction.user.id];
      poll.counts[idx]--;
      save('ankets.json', polls);
      await interaction.message.edit({ embeds: [anketEmbed(poll.soru, poll.secenekler, poll.counts, L)] }).catch(() => {});
      return interaction.reply({ content: t(L, 'poll.unvoted'), ephemeral: true });
    }
    if (onceki !== undefined && poll.counts[onceki] > 0) poll.counts[onceki]--;
    poll.voters[interaction.user.id] = idx;
    poll.counts[idx]++;
    save('ankets.json', polls);
    await interaction.message.edit({ embeds: [anketEmbed(poll.soru, poll.secenekler, poll.counts, L)] }).catch(() => {});
    return interaction.reply({ content: t(L, 'poll.voted', { s: poll.secenekler[idx] }), ephemeral: true });
  }

  return interaction.reply({ content: t(L, 'poll.unknownBtn'), ephemeral: true });
}

module.exports = { handle };
