// Kullanıcı başına sohbet hafızası (son N tur).
// Anahtar: guild varsa "guild:user", DM ise "dm:user".
// JSON dosyada tutulur (aihistory.json), restart'a dayanıklı.
const { load, save } = require('./store');

const DOSYA = 'aihistory.json';
const MAX_TUR = 6; // son 6 soru-cevap (12 mesaj)
const MAX_MSG = 800; // hafızaya atılan tek mesajın kesilme sınırı

function anahtar(userId, guildId) {
  return guildId ? `${guildId}:${userId}` : `dm:${userId}`;
}

function kirp(s) {
  s = String(s || '');
  return s.length > MAX_MSG ? s.slice(0, MAX_MSG) + '…' : s;
}

function getHistory(userId, guildId) {
  const map = load(DOSYA, {});
  const h = map[anahtar(userId, guildId)];
  return Array.isArray(h) ? h : [];
}

// Yeni soru-cevap çiftini ekler, eskileri budar.
function pushHistory(userId, guildId, soru, cevap) {
  try {
    const map = load(DOSYA, {});
    const k = anahtar(userId, guildId);
    const arr = Array.isArray(map[k]) ? map[k] : [];
    arr.push({ role: 'user', content: kirp(soru) });
    arr.push({ role: 'assistant', content: kirp(cevap) });
    map[k] = arr.slice(-MAX_TUR * 2);
    // Büyüme koruması: en fazla 500 konuşma sakla
    const keys = Object.keys(map);
    if (keys.length > 500) {
      for (const kk of keys.slice(0, keys.length - 500)) delete map[kk];
    }
    save(DOSYA, map);
  } catch {}
}

function clearHistory(userId, guildId) {
  const map = load(DOSYA, {});
  const k = anahtar(userId, guildId);
  const vardi = Boolean(map[k] && map[k].length);
  delete map[k];
  save(DOSYA, map);
  return vardi;
}

function historyCount(userId, guildId) {
  return Math.floor(getHistory(userId, guildId).length / 2);
}

// Anahtar-kelime araması: geçmiş uzunsa son turları değil, soruyla
// alakalı turları seçer. ("bence b" gibi kısa ama kritik turlar kaybolmaz.)
// Bütçe dolunca durur, sonuç kronolojik sırayla döner.
const DUR_KELIME = new Set((
  've bir bu şu o da de ki mi mı mu mü ne ile için gibi çok daha en ben sen biz siz onlar' +
  ' ama fakat çünkü eğer sonra önce şimdi burada orada nasıl neden hangi şey kişi zaman' +
  ' the be to of and a in that have it for not on with he as you do at this but his by' +
  ' from they we say her she or an will my one all would there their what so up out if' +
  ' about who get which go me when make can like time just him know take people into' +
  ' year your good some could them see other than then now look only come its over' +
  ' think also back after use two how our work first well way even new want because' +
  ' any these give day most us are is was were will would could should does did has had'
).split(/\s+/));

function anahtarlar(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 3 && !DUR_KELIME.has(w))
    .slice(0, 20);
}

function gecmisteAra(userId, guildId, soru, butce = 2500) {
  const gecmis = getHistory(userId, guildId);
  if (!gecmis.length) return [];
  const keys = anahtarlar(soru);
  if (!keys.length) return gecmis.slice(-4); // anahtar yoksa son 2 tur
  // Turlara böl (user+assistant çiftleri)
  const turlar = [];
  for (let i = 0; i < gecmis.length; i += 2) turlar.push(gecmis.slice(i, i + 2));
  const skorlu = turlar.map((tur, idx) => {
    const metin = tur.map(m => String((m && m.content) || '').toLocaleLowerCase('tr')).join(' ');
    let skor = 0;
    for (const k of keys) if (metin.includes(k)) skor++;
    return { tur, idx, skor };
  });
  // Skorlular önce (eşitlikte yeniler), bütçeye sığanlar alınır
  skorlu.sort((a, b) => (b.skor - a.skor) || (b.idx - a.idx));
  const secili = [];
  let toplam = 0;
  for (const s of skorlu) {
    if (s.skor === 0 && secili.length > 0) break;
    const boy = s.tur.reduce((a, m) => a + String((m && m.content) || '').length, 0);
    if (toplam + boy > butce) continue;
    secili.push(s);
    toplam += boy;
  }
  if (!secili.length) return gecmis.slice(-4);
  secili.sort((a, b) => a.idx - b.idx);
  return secili.flatMap(s => s.tur);
}

module.exports = { getHistory, pushHistory, clearHistory, historyCount, gecmisteAra, MAX_TUR };
