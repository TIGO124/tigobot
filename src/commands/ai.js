const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { getUserModel, defaultNvidia, modelName } = require('../ai-models');
const { cooldownLeft, markCooldown, MAX_SORU } = require('../ai');
const { guvenilirMi } = require('../trust');
const { aiAkis, durumEmbed, animMetni } = require('../ai-progress');

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
    if (!guvenilirMi(interaction.guildId, interaction.user.id, sahipMi)) {
      const kalan = cooldownLeft(interaction.user.id, interaction.guildId);
      if (kalan > 0) {
        return interaction.reply({ content: t(L, 'ai.cooldown', { kalan }), ephemeral: true });
      }
      markCooldown(interaction.user.id, interaction.guildId);
    }
    const model = getUserModel(interaction.user.id);
    const baslangic = animMetni(0, L);
    await interaction.deferReply();
    const mesaj = await interaction.editReply({ embeds: [durumEmbed(baslangic, modelName(model, L), L)] });
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
