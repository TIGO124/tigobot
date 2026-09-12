const { EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { load, save } = require('./store');
const { anketEmbed } = require('./commands/anket');

async function handle(interaction) {
  const L = getLang(interaction.guildId);
  const id = interaction.customId;

  // AI yönetim onayı: ayonay_<id> / ayred_<id>
  if (id.startsWith('ayonay_') || id.startsWith('ayred_')) {
    const onay = id.startsWith('ayonay_');
    const bid = id.slice(onay ? 7 : 6);
    const { bekleyenAl } = require('./ai-yonetim');
    const { KATALOG } = require('./ai-actions');
    const { sahipMi } = require('./owner');
    const b = bekleyenAl(bid);
    if (!b) return interaction.reply({ content: t(L, 'mg.onayGecti'), ephemeral: true });
    const istekSahibi = interaction.user.id === b.userId;
    let sunucuSahibi = false;
    try { sunucuSahibi = interaction.guild && interaction.guild.ownerId === interaction.user.id; } catch {}
    if (!istekSahibi && !sunucuSahibi && !sahipMi(interaction.user)) {
      return interaction.reply({ content: t(L, 'mg.onayYetki'), ephemeral: true });
    }
    if (!onay) {
      await interaction.update({ content: t(L, 'mg.reddedildi'), components: [] }).catch(() => {});
      return;
    }
    const giris = KATALOG[b.op];
    if (!giris) {
      await interaction.update({ content: t(L, 'mg.islemKapali'), components: [] }).catch(() => {});
      return;
    }
    // Onay anında işlem kapatılmışsa çalıştırma
    try {
      const { isOpEnabled } = require('./ai-perms');
      if (!isOpEnabled(b.op, KATALOG)) {
        await interaction.update({ content: t(L, 'mg.islemKapali'), components: [] }).catch(() => {});
        return;
      }
    } catch {}
    const ctx = { guild: interaction.guild, channel: interaction.channel, member: interaction.member, user: interaction.user, lang: b.lang, client: interaction.client };
    const sonuc = await giris.run(ctx, b.args);
    try {
      const { denetim } = require('./ai-yonetim');
      // Denetimde gerçek isteyen görünsün (onaylayan değil)
      const asil = { ...ctx, user: { tag: b.userTag || b.userId, id: b.userId } };
      denetim(asil, b.op, b.args, sonuc, `onaylayan: ${interaction.user.tag}`);
    } catch {}
    await interaction.update({ content: sonuc.text, components: [] }).catch(() => {});
    return;
  }

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
    if (!poll || !Array.isArray(poll.secenekler) || !poll.secenekler[idx]) {
      return interaction.reply({ content: t(L, 'poll.gone'), ephemeral: true });
    }
    // Bozuk/eksik sayaç şeklini onar (negatif/NaN oy engellenir)
    if (!Array.isArray(poll.counts) || poll.counts.length !== poll.secenekler.length) {
      poll.counts = poll.secenekler.map(() => 0);
    } else {
      poll.counts = poll.counts.map(n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0));
    }
    if (!poll.voters || typeof poll.voters !== 'object') poll.voters = {};
    else {
      // Bozuk oy kayıtlarını ayıkla (aralık dışı indeks şişmeye yol açar)
      for (const [uid, v] of Object.entries(poll.voters)) {
        if (!Number.isInteger(v) || v < 0 || v >= poll.secenekler.length) delete poll.voters[uid];
      }
    }
    const onceki = poll.voters[interaction.user.id];
    if (onceki === idx) {
      delete poll.voters[interaction.user.id];
      poll.counts[idx] = Math.max(0, (poll.counts[idx] || 0) - 1);
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
