// OpenAI-uyumlu sohbet istemcisi.
// - kind 'local'  -> PC'deki Ollama (AI_BASE_URL), NVIDIA key kullanılmaz.
// - kind 'nvidia' -> NVIDIA API, sadece NVIDIA_API_KEY kullanılır.
// - Yerel servise ulaşılamazsa LOCAL_UNREACHABLE hatası verir (yedek için).
// - Tüm istekler tek kuyruktan FIFO sırayla geçer (kuyrugaEkle/siraBilgisi).
const { sanitize } = require('./sanitize');
const { acikMi } = require('./local');
const { t } = require('./i18n');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const BEKLEME_MS = 15 * 1000;
const MAX_SORU = 1000;

async function callOpenAI(base, apiKey, model, messages, timeoutMs) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }),
    signal: AbortSignal.timeout(timeoutMs || 180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
  if (!text) throw new Error('AI boş cevap verdi.');
  return text;
}

function erisilemezMi(e) {
  if (!e) return false;
  if (e.code === 'LOCAL_UNREACHABLE') return true;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  if (e instanceof TypeError) return true;
  return /fetch failed|connect|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout/i.test(e.message || '');
}

async function chat(model, messages, lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  const tum = [{ role: 'system', content: t(L, 'sys.prompt') }, ...messages];
  if (model.kind === 'nvidia') {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
    }
    return callOpenAI(NVIDIA_BASE, process.env.NVIDIA_API_KEY, model.model, tum, 180000);
  }
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!acikMi() || !base) {
    // Kapalıysa veya tünel adresi yoksa yerel servis kapalı sayılır -> nvidia yedeğe düşer
    const err = new Error('LOCAL_UNREACHABLE');
    err.code = 'LOCAL_UNREACHABLE';
    throw err;
  }
  try {
    return await callOpenAI(base, process.env.LOCAL_API_KEY || null, model.model, tum, 60000);
  } catch (e) {
    if (erisilemezMi(e)) {
      const err = new Error('LOCAL_UNREACHABLE');
      err.code = 'LOCAL_UNREACHABLE';
      throw err;
    }
    throw e;
  }
}

// Global FIFO kuyruk: TÜM modellerde (yerel 4B/9B + nvidia) aynı anda tek üretim.
const bekleyenler = [];
let aktifIs = null;
let isSayaci = 0;

function siradaki() {
  if (aktifIs) return;
  const job = bekleyenler.shift();
  if (!job) return;
  aktifIs = job;
  job.is().then(
    sonuc => { aktifIs = null; job.resolve(sonuc); siradaki(); },
    hata => { aktifIs = null; job.reject(hata); siradaki(); }
  );
}

function kuyrugaEkle(userId, userTag, modelAdi, is) {
  const job = { id: ++isSayaci, userId, userTag, modelAdi, is, resolve: null, reject: null };
  const sonuc = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  bekleyenler.push(job);
  siradaki();
  return { jobId: job.id, sonuc };
}

function siraBilgisi(jobId) {
  if (aktifIs && aktifIs.id === jobId) return { sira: 1, toplam: bekleyenler.length + 1 };
  const idx = bekleyenler.findIndex(j => j.id === jobId);
  if (idx === -1) return null;
  return { sira: idx + 2, toplam: bekleyenler.length + 1 };
}

function queueDepth() {
  return bekleyenler.length + (aktifIs ? 1 : 0);
}

async function uretimYap(model, yedekModel, messages, lang) {
  try {
    const text = await chat(model, messages, lang);
    return { text, model, note: '' };
  } catch (e) {
    if (e && e.code === 'LOCAL_UNREACHABLE') {
      const text = await chat(yedekModel, messages, lang);
      return { text, model: yedekModel, note: '' };
    }
    if (model.kind === 'nvidia' && /\(404\)/.test(e.message || '') && model.key !== yedekModel.key) {
      const text = await chat(yedekModel, messages, lang);
      return { text, model: yedekModel, note: t(lang, 'ai.fallback.nvidia') };
    }
    throw e;
  }
}

// Kredi/spam koruması: sunucu başına kullanıcı bekleme süresi
const bekleme = new Map();
function anahtar(userId, guildId) {
  return guildId ? `${guildId}:${userId}` : `dm:${userId}`;
}
function cooldownLeft(userId, guildId) {
  const kalan = BEKLEME_MS - (Date.now() - (bekleme.get(anahtar(userId, guildId)) || 0));
  return kalan > 0 ? Math.ceil(kalan / 1000) : 0;
}
function markCooldown(userId, guildId) {
  if (bekleme.size > 5000) bekleme.clear();
  bekleme.set(anahtar(userId, guildId), Date.now());
}

function splitText(text, max = 2000) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.4) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

// Yerel servise hızlı bakış (akış başında hangi modelin cevaplayacağını bilmek için).
// Kapalı/adres yoksa anında döner; ağ takılırsa en fazla ~5 sn sürer.
async function yerelHazirMi() {
  if (!acikMi()) return { hazir: false, sayi: 0 };
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return { hazir: false, sayi: 0 };
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { hazir: false, sayi: 0 };
    const data = await res.json();
    return { hazir: true, sayi: (data.models || []).length };
  } catch {
    return { hazir: false, sayi: 0 };
  }
}

module.exports = { chat, uretimYap, kuyrugaEkle, siraBilgisi, queueDepth, splitText, cooldownLeft, markCooldown, MAX_SORU, yerelHazirMi };
