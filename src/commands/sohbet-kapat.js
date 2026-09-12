const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../i18n');
const { bul, kaldir, kullanicininKanali } = require('../sohbet');

const NAMES = { tr: 'sohbet-kapat', en: 'close-chat' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'chat.close.desc'));
  // NOT: Discord-side yetki kilidi YOK (ai.js ile aynı).
  // Erişim index.js'teki özel-bot kilidiyle denetlenir (sahip + beta-tester).

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!interaction.guild) {
      return interaction.reply({ content: t(L, 'chat.dm'), ephemeral: true });
    }
    // Kapatılacak kanal: bulunulan kanal kayıtlıysa o, yoksa kullanıcının kanalı.
    let hedefId = null;
    try {
      if (bul(interaction.channelId)) hedefId = interaction.channelId;
      else {
        const k = kullanicininKanali(interaction.guildId, interaction.user.id);
        if (k) hedefId = k.channelId;
      }
    } catch {}
    if (!hedefId) {
      return interaction.reply({ content: t(L, 'chat.close.none'), ephemeral: true });
    }
    const ch = interaction.guild.channels.cache.get(hedefId);
    if (!ch) {
      // Kanal elle silinmiş: ölü kaydı temizle
      try { kaldir(hedefId); } catch {}
      return interaction.reply({ content: t(L, 'chat.close.done'), ephemeral: true });
    }
    try {
      await ch.delete(`Özel sohbet kapatıldı (${interaction.user.tag})`);
    } catch {
      return interaction.reply({ content: t(L, 'chat.close.err'), ephemeral: true });
    }
    try { kaldir(hedefId); } catch {}
    // Kanal silindikten sonra ephemeral yanıt etkileşim token'ıyla gider.
    await interaction.reply({ content: t(L, 'chat.close.done'), ephemeral: true }).catch(() => {});
  }

  return { data, execute };
}

module.exports = { build };
