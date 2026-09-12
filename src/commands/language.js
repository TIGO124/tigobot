const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang, setLang } = require('../i18n');
const { registerGuildCommands } = require('../schema');

// Komut adı iki dilde de 'language' (evrensel tanınır).
const NAMES = { tr: 'language', en: 'language' };

function build(lang) {
  const data = new SlashCommandBuilder()
    .setName(NAMES[lang] || NAMES.tr)
    .setDescription(t(lang, 'lang.desc'))
    .addStringOption(o => {
      o.setName('lang').setDescription(t(lang, 'lang.opt')).setRequired(true);
      o.addChoices({ name: 'Türkçe', value: 'tr' }, { name: 'English', value: 'en' });
      return o;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  async function execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: t(getLang(null), 'lang.dm'), ephemeral: true });
    }
    const L = getLang(interaction.guildId);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(L, 'lang.needManage'), ephemeral: true });
    }
    const secim = interaction.options.getString('lang') === 'en' ? 'en' : 'tr';
    const onceki = getLang(interaction.guildId);
    setLang(interaction.guildId, secim);
    try {
      await registerGuildCommands(interaction.guildId, secim, interaction.client);
    } catch {
      // Komut basılamazsa dili geri al (lang.json <-> Discord ıraksamasın)
      try { setLang(interaction.guildId, onceki); } catch {}
      return interaction.reply({ content: t(secim, 'lang.redeployFail'), ephemeral: true });
    }
    await interaction.reply(t(secim, 'lang.ok'));
  }

  return { data, execute };
}

module.exports = { build };
