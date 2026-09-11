// AI yönetim akışı (orkestrasyon).
// Dönen değer: true = istek yönetimce ele alındı (yanıt verildi), false/null = normal sohbete düş.
// - DM'de yönetim yok (guild şart).
// - ai-perms: global/sunucu açık + kim-kullanır kontrolü.
// - Yüksek-risk + onay gerektiren işlem -> buton onayı (60 sn), yoksa direkt çalışır.
// - Her uygulama denetim loguna düşer (konsol + logger).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('./i18n');
const { KATALOG } = require('./ai-actions');
const perms = require('./ai-perms');
const { cozumle } = require('./ai-intent');

const ONAY_MS = 60 * 1000;
const bekleyenler = new Map(); // id -> { op, args, userId, guildId, channelId, lang, timer }

function opAdi(op, lang) {
  return t(lang, `mg.op.${op}`) === `mg.op.${op}` ? op : t(lang, `mg.op.${op}`);
}

function bekleyenEkle(op, args, ctx) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const timer = setTimeout(() => { bekleyenler.delete(id); }, ONAY_MS);
  bekleyenler.set(id, { op, args, userId: ctx.user.id, guildId: ctx.guild.id, channelId: ctx.channel.id, lang: ctx.lang, timer });
  return id;
}

function bekleyenAl(id) {
  const b = bekleyenler.get(id);
  if (b) {
    clearTimeout(b.timer);
    bekleyenler.delete(id);
  }
  return b || null;
}

function denetim(ctx, op, args, sonuc) {
  try {
    console.log(`AI-YONETIM ${ctx.guild.id}/${ctx.user.tag} ${op} ${JSON.stringify(args).slice(0, 300)} -> ${sonuc.ok ? 'OK' : 'HATA'}`);
  } catch {}
  // Denetim kanalı: sunucu ayarı -> LOG_CHANNEL_ID -> isim araması. Sessiz geçilir.
  try {
    const L = getLang(ctx.guild.id);
    const ozet = Object.entries(args || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ').slice(0, 1000) || '-';
    const embed = new EmbedBuilder()
      .setTitle(t(L, 'mg.logBaslik'))
      .setColor(sonuc.ok ? 0x57F287 : 0xED4245)
      .addFields(
        { name: t(L, 'mg.logIslem'), value: `${opAdi(op, L)} (${op})`, inline: true },
        { name: t(L, 'mg.logSonuc'), value: sonuc.ok ? 'OK' : t(L, 'mg.logHata'), inline: true },
        { name: t(L, 'mg.logIsteyen'), value: `${ctx.user.tag} (${ctx.user.id})` },
        { name: t(L, 'mg.logParam'), value: ozet },
      )
      .setTimestamp();
    const kanal = denetimKanali(ctx.guild);
    if (kanal) kanal.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

function denetimKanali(guild) {
  try {
    const ozel = perms.getLogKanal(guild.id);
    if (ozel) {
      const c = guild.channels.cache.get(ozel);
      if (c && c.isTextBased()) return c;
    }
    const envId = (process.env.LOG_CHANNEL_ID || '').trim();
    if (envId) {
      const c = guild.channels.cache.get(envId);
      if (c && c.isTextBased()) return c;
    }
    return guild.channels.cache.find(c =>
      c.isTextBased() && ['ai-yonetim-log', 'yonetim-log', 'log', 'mod-log', 'ceza-log', 'kayıt'].some(n => (c.name || '').toLowerCase().includes(n))
    ) || null;
  } catch { return null; }
}

async function onaySor(gonder, ctx, op, args) {
  const id = bekleyenEkle(op, args, ctx);
  const L = ctx.lang;
  const ozet = Object.entries(args).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ayonay_${id}`).setLabel(t(L, 'mg.onayla')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ayred_${id}`).setLabel(t(L, 'mg.reddet')).setStyle(ButtonStyle.Secondary)
  );
  await gonder({ content: t(L, 'mg.onaySor', { op: opAdi(op, L), ozet }), components: [row] });
}

// ctx: { guild, channel, member, user, lang }
// gonder: (payload) => Promise (reply/send soyutlaması)
async function yonetimAkis(ctx, soru, gonder) {
  const L = ctx.lang;
  try {
    if (!ctx.guild) return false;
    if (!perms.acikMi(ctx.guild.id)) return false;
    if (!perms.kullanabilirMiYonetim(ctx.user, ctx.member, ctx.guild)) return false;
    let niyet = null;
    try {
      niyet = await cozumle(soru, L, ctx.guild.id);
    } catch (e) {
      const msg = String((e && e.message) || '');
      if (e && e.code === 'LOCAL_UNREACHABLE' || /LOCAL_UNREACHABLE|fetch failed|timeout/i.test(msg)) {
        await gonder({ content: t(L, 'mg.yerelKapali') }).catch(() => {});
        return true;
      }
      if (/401|403/.test(msg) || /NVIDIA_API_KEY/i.test(msg)) {
        await gonder({ content: t(L, 'mg.ajanHata') }).catch(() => {});
        return true;
      }
      return false;
    }
    if (!niyet || !niyet.op) return false; // yönetim değil -> normal sohbet
    const giris = KATALOG[niyet.op];
    if (!giris || !perms.isOpEnabled(niyet.op, KATALOG)) {
      await gonder({ content: t(L, 'mg.islemKapali') }).catch(() => {});
      return true;
    }
    if (giris.risk === 'yuksek' && perms.needsApproval(niyet.op)) {
      await onaySor(gonder, ctx, niyet.op, niyet.args);
      return true;
    }
    const sonuc = await giris.run(ctx, niyet.args);
    denetim(ctx, niyet.op, niyet.args, sonuc);
    await gonder({ content: sonuc.text }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

module.exports = { yonetimAkis, bekleyenAl, opAdi, denetim };
