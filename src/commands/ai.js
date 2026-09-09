const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { effectiveModel, defaultNvidia } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { guvenilirMi } = require('../trust');
const { aiAkis, durumEmbed, animMetni } = require('../ai-progress');
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
    const baslangic = animMetni(0, L);
    await interaction.deferReply();
    const mesaj = await interaction.editReply({ embeds: [durumEmbed(baslangic, L)] });
    await aiAkis({
      mesaj,
      ekGonder: o => interaction.followUp(o),
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      guildId: interaction.guildId,
      model,
      yedek: defaultNvidia(),
      soru,
      baslangic,
    });
  }

  return { data, execute };
}

module.exports = { build };
