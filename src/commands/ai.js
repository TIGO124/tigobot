const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { effectiveModel, defaultNvidia } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { guvenilirMi } = require('../trust');
const { aiAkis } = require('../ai-progress');
const { isBlocked, blockRemainingMs } = require('../quota');

const NAMES = { tr: 'ai', en: 'ai' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'ai.desc'))
    .addStringOption(o => o.setName('soru').setDescription(t(lang, 'ai.opt')).setRequired(true));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const soru = interaction.options.getString('soru');
    if (soru.length > MAX_SORU) {
      return interaction.reply({ content: t(L, 'ai.toolong', { max: MAX_SORU }), ephemeral: true });
    }
    const sahipMi = interaction.guild?.ownerId === interaction.user.id;
    const guvenilir = guvenilirMi(interaction.guildId, interaction.user.id, sahipMi);
    // Token kotası: blokluysa güvenilir kullanıcı bile kullanamaz (kotayı aşan kullanıcı)
    if (isBlocked(interaction.user.id)) {
      const saat = Math.max(1, Math.ceil(blockRemainingMs(interaction.user.id) / 3600000));
      return interaction.reply({ content: t(L, 'quota.blocked', { h: saat }), ephemeral: true });
    }
    if (!guvenilir) {
      const kalan = cooldownLeft(interaction.user.id, interaction.guildId);
      if (kalan > 0) {
        return interaction.reply({ content: t(L, 'ai.cooldown', { kalan }), ephemeral: true });
      }
      markCooldown(interaction.user.id, interaction.guildId);
    }
    const model = effectiveModel(interaction.guildId);
    // Önce defer: yönetim niyeti 9B/NVIDIA'ya sorulurken 3 sn etkileşim
    // penceresi dolarsa, yavaş ajanda cevap sessizce ölüyordu (defer yoksa
    // geç kalan reply "Unknown Interaction" olur). Defer'lı akışta gonder
    // otomatik followUp'a düşer, sessiz ölüm kapanır.
    await interaction.deferReply();
    // AI yönetim: soru yönetim niyeti taşıyorsa önce burası ele alır.
    // Ele alınmazsa neden-notu sohbete eklenir (model uydurma komut veremesin).
    // Ucuz kelime ön-filtresi: alamet yoksa 9B'ye sorulmaz, sohbet gecikmez.
    let yonetimNotu = '';
    try {
      const { yonetimAkis, yonetimBenzeriMi } = require('../ai-yonetim');
      if (yonetimBenzeriMi(soru)) {
        const gonder = o => (interaction.replied || interaction.deferred
          ? interaction.followUp(o)
          : interaction.reply(o));
        const bilgi = {};
        const eleAlindi = await yonetimAkis(
          { guild: interaction.guild, channel: interaction.channel, member: interaction.member, user: interaction.user, lang: L },
          soru,
          gonder,
          bilgi
        );
        if (eleAlindi) {
          // Defer placeholder'ı çöpe at: sonuç followUp ile geldi, boş
          // "thinking..." mesajı kanalda kalmasın.
          await interaction.deleteReply().catch(() => {});
          return;
        }
        yonetimNotu = (bilgi && bilgi.not) || '';
      }
    } catch {}
    await aiAkis({
      ilkGonder: o => interaction.editReply(o),
      ekGonder: o => interaction.followUp(o),
      kanal: interaction.channel,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      guildId: interaction.guildId,
      model,
      yedek: defaultNvidia(),
      soru,
      yonetimNotu,
    });
  }

  return { data, execute };
}

module.exports = { build };
