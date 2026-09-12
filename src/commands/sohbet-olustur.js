const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../i18n');
const { kaydet, kullanicininKanali, kaldir } = require('../sohbet');

const NAMES = { tr: 'sohbet-olustur', en: 'create-chat' };

function kanalAdi(user) {
  const ham = String((user && user.username) || 'sohbet').toLocaleLowerCase('tr');
  const temiz = ham.replace(/[^a-zçğıöşü0-9-_]/g, '').slice(0, 20) || 'sohbet';
  // Aynı sluga düşen iki kullanıcı ayırt edilebilsin (panel/moderasyon için)
  const kuyruk = String((user && user.id) || '0000').slice(-4);
  return `sohbet-${temiz}-${kuyruk}`;
}

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'chat.desc'));
  // NOT: Discord-side yetki kilidi YOK (ai.js ile aynı).
  // Erişim index.js'teki özel-bot kilidiyle denetlenir (sahip + beta-tester).

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    if (!interaction.guild) {
      return interaction.reply({ content: t(L, 'chat.dm'), ephemeral: true });
    }
    // Zaten açık sohbet varsa yenisini açma
    try {
      const mevcut = kullanicininKanali(interaction.guildId, interaction.user.id);
      if (mevcut) {
        const ch = interaction.guild.channels.cache.get(mevcut.channelId);
        if (ch) return interaction.reply({ content: t(L, 'chat.exists', { ch }), ephemeral: true });
        kaldir(mevcut.channelId); // ölü kayıt
      }
    } catch {}
    try {
      const kanal = await interaction.guild.channels.create({
        name: kanalAdi(interaction.user),
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
        reason: `Özel sohbet (${interaction.user.tag})`,
      });
      try {
        kaydet(kanal.id, { guildId: interaction.guildId, userId: interaction.user.id, userTag: interaction.user.tag, createdAt: Date.now() });
      } catch {}
      try { await kanal.send(t(L, 'chat.welcome', { u: interaction.user })); } catch {}
      await interaction.reply({ content: t(L, 'chat.done', { ch: kanal }), ephemeral: true });
    } catch {
      await interaction.reply({ content: t(L, 'chat.err'), ephemeral: true }).catch(() => {});
    }
  }

  return { data, execute };
}

module.exports = { build };
