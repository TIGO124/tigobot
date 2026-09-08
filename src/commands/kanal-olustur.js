const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { t, getLang } = require('../i18n');

const NAMES = { tr: 'kanal-olustur', en: 'create-channel' };
const TURLER = {
  tr: [{ n: 'Metin', v: 'metin' }, { n: 'Ses', v: 'ses' }],
  en: [{ n: 'Text', v: 'metin' }, { n: 'Voice', v: 'ses' }],
};

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'mkchan.desc'))
    .addStringOption(o => o.setName('ad').setDescription(t(lang, 'mkchan.opt.name')).setRequired(true))
    .addStringOption(o => {
      o.setName('tur').setDescription(t(lang, 'mkchan.opt.type')).setRequired(true);
      for (const c of (TURLER[lang] || TURLER.tr)) o.addChoices({ name: c.n, value: c.v });
      return o;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

  async function execute(interaction) {
    const L = getLang(interaction.guildId);
    const ad = interaction.options.getString('ad').toLowerCase().replace(/\s+/g, '-');
    const tur = interaction.options.getString('tur');
    try {
      const kanal = await interaction.guild.channels.create({
        name: ad,
        type: tur === 'ses' ? ChannelType.GuildVoice : ChannelType.GuildText,
      });
      await interaction.reply(t(L, 'mkchan.done', { ch: kanal, t: tur }));
    } catch {
      await interaction.reply({ content: t(L, 'mkchan.err'), ephemeral: true });
    }
  }

  return { data, execute };
}

module.exports = { build };
