const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { t, getLang } = require('../i18n');
const { load, save } = require('../store');
const { etiket } = require('../counter');

const NAMES = { tr: 'sayac-kur', en: 'counter' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'counter.desc'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const map = load('counter.json', {});
    const eski = map[interaction.guildId];
    if (eski) {
      const ch = interaction.guild.channels.cache.get(eski);
      if (ch) return interaction.reply({ content: t(L, 'counter.exists', { ch }), ephemeral: true });
    }
    try {
      const kanal = await interaction.guild.channels.create({
        name: etiket(L, interaction.guild.memberCount),
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }],
      });
      map[interaction.guildId] = kanal.id;
      save('counter.json', map);
      await interaction.reply(t(L, 'counter.done', { ch: kanal }));
    } catch {
      await interaction.reply({ content: t(L, 'counter.fail'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
