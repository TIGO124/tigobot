const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { generateImage, imgCooldownLeft, markImgCooldown, MAX_PROMPT } = require('../ai-image');
const { kuyrugaEkle, siraBilgisi } = require('../ai');
const { guvenilirMi } = require('../trust');
const { durumEmbed, animMetni } = require('../ai-progress');

const NAMES = { tr: 'ai-gorsel', en: 'ai-image' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'img.desc'))
    .addStringOption(o => o.setName('prompt').setDescription(t(lang, 'img.opt')).setRequired(true))
    .addStringOption(o => o
      .setName('boyut')
      .setDescription(t(lang, 'img.opt.size'))
      .addChoices(
        { name: '⬛ 1:1', value: 'square' },
        { name: '↕️ 9:16', value: 'portrait' },
        { name: '↔️ 16:9', value: 'landscape' },
      ));

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const prompt = interaction.options.getString('prompt');
    const size = interaction.options.getString('boyut') || 'square';
    if (prompt.length > MAX_PROMPT) {
      return interaction.reply({ content: t(L, 'img.toolong', { max: MAX_PROMPT }), ephemeral: true });
    }
    if (!process.env.NVIDIA_API_KEY) {
      return interaction.reply({ content: t(L, 'img.nokey'), ephemeral: true });
    }
    const sahipMi = interaction.guild?.ownerId === interaction.user.id;
    if (!guvenilirMi(interaction.guildId, interaction.user.id, sahipMi)) {
      const kalan = imgCooldownLeft(interaction.user.id, interaction.guildId);
      if (kalan > 0) {
        return interaction.reply({ content: t(L, 'ai.cooldown', { kalan }), ephemeral: true });
      }
      markImgCooldown(interaction.user.id, interaction.guildId);
    }
    await interaction.deferReply();
    const baslangic = animMetni(0, L);
    const mesaj = await interaction.editReply({ embeds: [durumEmbed(baslangic, 'FLUX', L)] });
    // Global AI kuyruğundan geçir (metin üretimleriyle çakışmasın)
    const { jobId, sonuc } = kuyrugaEkle(interaction.user.id, interaction.user.tag, 'FLUX', () =>
      generateImage(prompt, size));
    let bitti = false;
    let animI = 1;
    const timer = setInterval(async () => {
      if (bitti) return;
      try {
        const b = siraBilgisi(jobId);
        const metin = !b || b.sira <= 1 ? animMetni(animI++, L) : '```diff\n' + t(L, 'ai.queue', { s: b.sira, t: b.toplam, o: b.sira - 1 }) + '\n```';
        await mesaj.edit({ embeds: [durumEmbed(metin, 'FLUX', L)] }).catch(() => {});
      } catch {}
    }, 3000);
    try {
      const { buffer, model } = await sonuc;
      bitti = true;
      clearInterval(timer);
      const dosya = new AttachmentBuilder(buffer, { name: 'tigobot.png' });
      const embed = new EmbedBuilder()
        .setTitle(t(L, 'img.title'))
        .setDescription(prompt.length > 1000 ? prompt.slice(0, 1000) + '…' : prompt)
        .setColor(0x5865F2)
        .setImage('attachment://tigobot.png')
        .setFooter({ text: t(L, 'ai.modelTag', { m: model }) })
        .setTimestamp();
      await mesaj.edit({ embeds: [embed], files: [dosya] });
    } catch (e) {
      bitti = true;
      clearInterval(timer);
      const { kullaniciMesaji } = require('../sanitize');
      await mesaj.edit(kullaniciMesaji(e, L).slice(0, 2000)).catch(() => {});
    }
  }

  return { data, execute };
}

module.exports = { build };
