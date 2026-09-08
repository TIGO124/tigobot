const { EmbedBuilder } = require('discord.js');
const { load, save } = require('./store');

function oyEmbedi(poll) {
  const toplam = poll.counts.reduce((a, b) => a + b, 0);
  const satirlar = poll.secenekler.map((s, i) => {
    const oy = poll.counts[i] || 0;
    const yuzde = toplam ? Math.round((oy / toplam) * 100) : 0;
    return `**${i + 1}. ${s}** — ${oy} oy (%${yuzde})`;
  });
  return new EmbedBuilder()
    .setTitle(`Anket: ${poll.soru}`)
    .setDescription(satirlar.join('\n'))
    .setColor(0x5865F2)
    .setFooter({ text: `Toplam oy: ${toplam} | Oy vermek için butona bas` })
    .setTimestamp();
}

async function handle(interaction) {
  const id = interaction.customId;

  // Tepki-rol: rr_<rolId>
  if (id.startsWith('rr_')) {
    const rolId = id.slice(3);
    const rol = interaction.guild.roles.cache.get(rolId);
    if (!rol) return interaction.reply({ content: 'Rol bulunamadı (silinmiş olabilir).', ephemeral: true });
    try {
      if (interaction.member.roles.cache.has(rolId)) {
        await interaction.member.roles.remove(rolId);
        return interaction.reply({ content: `${rol.name} rolü alındı.`, ephemeral: true });
      }
      await interaction.member.roles.add(rolId);
      return interaction.reply({ content: `${rol.name} rolü verildi.`, ephemeral: true });
    } catch {
      return interaction.reply({ content: 'Rol verilemedi. Botun rolü, verilen rolden üstte olmalı.', ephemeral: true });
    }
  }

  // Anket oyu: anket_<pollId>_<index>
  if (id.startsWith('anket_')) {
    const [, pollId, idxStr] = id.split('_');
    const idx = Number(idxStr);
    const polls = load('ankets.json', {});
    const poll = polls[pollId];
    if (!poll || !poll.secenekler[idx]) {
      return interaction.reply({ content: 'Bu anket artık aktif değil.', ephemeral: true });
    }
    const onceki = poll.voters[interaction.user.id];
    if (onceki === idx) {
      delete poll.voters[interaction.user.id];
      poll.counts[idx]--;
      save('ankets.json', polls);
      await interaction.message.edit({ embeds: [oyEmbedi(poll)] }).catch(() => {});
      return interaction.reply({ content: 'Oyun geri alındı.', ephemeral: true });
    }
    if (onceki !== undefined && poll.counts[onceki] > 0) poll.counts[onceki]--;
    poll.voters[interaction.user.id] = idx;
    poll.counts[idx]++;
    save('ankets.json', polls);
    await interaction.message.edit({ embeds: [oyEmbedi(poll)] }).catch(() => {});
    return interaction.reply({ content: `"${poll.secenekler[idx]}" seçeneğine oy verdin.`, ephemeral: true });
  }
}

module.exports = { handle };
