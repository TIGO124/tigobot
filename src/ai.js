// Sohbet istemcisi (OpenAI-uyumlu + Ollama native).
// - kind 'local'  -> PC'deki Ollama (AI_BASE_URL), NVIDIA key kullanılmaz.
//   qwen3.5:4b VE qwen3.5:9b dahil tüm yerel modeller aynı yoldan geçer.
// - kind 'nvidia' -> NVIDIA API, sadece NVIDIA_API_KEY kullanılır.
// - Yerel servise ulaşılamazsa LOCAL_UNREACHABLE hatası verir (yedek için).
// - Tüm istekler tek kuyruktan FIFO sırayla geçer (kuyrugaEkle/siraBilgisi).
const { sanitize } = require('./sanitize');
const { acikMi } = require('./local');
const { t } = require('./i18n');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const BEKLEME_MS = 15 * 1000;
const MAX_SORU = 1000;

// Yerel üretim ayarları (Railway Variables ile ezilebilir):
// - AI_NUM_CTX: Ollama bağlam penceresi (varsayılan 8192)
// - AI_NUM_PREDICT: üretilecek max token (varsayılan 1024)
// - AI_LOCAL_TIMEOUT_MS: yerel tek deneme süresi (varsayılan 180000)
// - AI_KEEP_ALIVE: modelin VRAM'de tutulma süresi (varsayılan 10m, 4B/9B swap'ı azaltır)
function sayiEnv(ad, varsayilan, min, max) {
  const v = parseInt(process.env[ad], 10);
  if (!Number.isFinite(v)) return varsayilan;
  return Math.min(max, Math.max(min, v));
}
function yerelAyarlar() {
  return {
    numCtx: sayiEnv('AI_NUM_CTX', 8192, 2048, 32768),
    numPredict: sayiEnv('AI_NUM_PREDICT', 1024, 256, 4096),
    timeoutMs: sayiEnv('AI_LOCAL_TIMEOUT_MS', 180000, 30000, 600000),
    keepAlive: (process.env.AI_KEEP_ALIVE || '10m').slice(0, 16) || '10m',
  };
}

async function callOpenAI(base, apiKey, model, messages, timeoutMs, extra) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024, ...(extra || {}) }),
    signal: AbortSignal.timeout(timeoutMs || 180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  // Düşünen modeller (qwen3.5) akıl yürütmeyi ayrı alana koyabilir; cevap content'tir.
  const thinkIzi = msg ? String(msg.reasoning_content || msg.reasoning || '') : '';
  const text = msg ? String(msg.content || '').trim() : '';
  if (!text) {
    // Logda iz bırak (hangi modelin boş döndüğü anlaşılsın), kullanıcıya genel mesaj gider.
    try { console.error(`Yerel boş cevap (${model}): reasoning uzunluğu=${thinkIzi.length}`); } catch {}
    throw new Error('AI boş cevap verdi.');
  }
  // Token kullanımı (varsa) kota için döner; okuyamazsa 0.
  const usage = data.usage && Number(data.usage.total_tokens) > 0 ? Number(data.usage.total_tokens) : 0;
  return { text, usage };
}

// Ollama NATIVE sohbet ucu (/api/chat): think:false burada GERÇEKTEN geçerlidir.
// /v1/chat/completions 'think' alanını yok saydığı için uzun sorularda boş cevap
// dönmesinin başlıca sebebi buydu; native yol birincil, /v1 yedektir.
async function callOllamaNative(base, apiKey, model, messages, timeoutMs, ayar) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      keep_alive: ayar.keepAlive,
      options: { num_ctx: ayar.numCtx, num_predict: ayar.numPredict, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(timeoutMs || 180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const msg = data.message || {};
  const thinkIzi = String(msg.thinking || '');
  const text = String(msg.content || '').trim();
  if (!text) {
    try { console.error(`Yerel boş cevap native (${model}): thinking uzunluğu=${thinkIzi.length}`); } catch {}
    throw new Error('AI boş cevap verdi.');
  }
  const usage = (Number(data.prompt_eval_count) > 0 || Number(data.eval_count) > 0)
    ? Number(data.prompt_eval_count || 0) + Number(data.eval_count || 0)
    : 0;
  return { text, usage };
}

// Yerel /v1 yedek çağrı: 'think' YOK SAYILDIĞI için doğru kapatma alanları kullanılır.
// max_tokens burada da ezilir ki AI_NUM_PREDICT her iki yerel yolda da geçerli olsun.
function yerelV1Extra(ayar) {
  return {
    max_tokens: ayar.numPredict,
    reasoning_effort: 'none',
    reasoning: { effort: 'none' },
    options: { num_ctx: ayar.numCtx, num_predict: ayar.numPredict, temperature: 0.7 },
  };
}

// Uzun soru + dolu hafıza birleşince istek şişer; yerelde sondan kırp.
// System prompt korunur, en güncel turlar önceliklidir.
function yerelIcinKirp(tum, butce = 6000) {
  if (!Array.isArray(tum) || tum.length <= 1) return tum;
  const [sys, ...rest] = tum;
  let toplam = 0;
  const tutulan = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i];
    const len = String((m && m.content) || '').length;
    if (toplam + len > butce && tutulan.length > 0) break;
    tutulan.unshift(m);
    toplam += len;
  }
  // En az son kullanıcı sorusu mutlaka kalsın
  if (tutulan.length === 0 && rest.length > 0) tutulan.push(rest[rest.length - 1]);
  return [sys, ...tutulan];
}

function erisilemezMi(e) {
  if (!e) return false;
  if (e.code === 'LOCAL_UNREACHABLE') return true;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  if (e instanceof TypeError) return true;
  const m = String(e.message || '');
  // 502/503/504: Ollama kapalı ama tünel ayakta -> yedeğe düş (model 500'ü hariç).
  if (/AI hatası \(50[234]\)/.test(m)) return true;
  return /fetch failed|connect|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout/i.test(m);
}

async function chat(model, messages, lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  if (model.kind === 'nvidia') {
    const key = (process.env.NVIDIA_API_KEY || '').trim();
    if (!key) {
      throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
    }
    const tum = [{ role: 'system', content: t(L, 'sys.prompt') }, ...messages];
    return callOpenAI(NVIDIA_BASE, key, model.model, tum, 180000);
  }
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!acikMi() || !base) {
    // Kapalıysa veya tünel adresi yoksa yerel servis kapalı sayılır -> nvidia yedeğe düşer
    const err = new Error('LOCAL_UNREACHABLE');
    err.code = 'LOCAL_UNREACHABLE';
    throw err;
  }
  const ayar = yerelAyarlar();
  // /no_think: Qwen3 ailesinde sistem/komut düzeyinde düşünmeyi kapatır.
  // API bayrağı sürüme göre yok sayılsa bile ikinci güvencedir.
  const tum = yerelIcinKirp([
    { role: 'system', content: `${t(L, 'sys.prompt')} /no_think` },
    ...messages,
  ]);
  const yerelCagri = (ms) => callOllamaNative(base, process.env.LOCAL_API_KEY || null, model.model, tum, ms, ayar);
  const v1Cagri = (ms) => callOpenAI(base + '/v1', process.env.LOCAL_API_KEY || null, model.model, tum, ms, yerelV1Extra(ayar));
  try {
    try {
      return await yerelCagri(ayar.timeoutMs);
    } catch (ilk) {
      const msg = String((ilk && ilk.message) || '');
      // Model VRAM'e yüklenirken (4B<->9B swap) ilk istek boş dönebilir -> bir kez daha dene
      if (msg.includes('boş cevap')) {
        try {
          return await yerelCagri(ayar.timeoutMs);
        } catch (ikinci) {
          // Native iki kez boş döndüyse /v1 yedeğini dene (sürüm farkı ihtimali)
          if (String((ikinci && ikinci.message) || '').includes('boş cevap')) {
            return await v1Cagri(ayar.timeoutMs);
          }
          throw ikinci;
        }
      }
      // Native uç yoksa (404) veya eski sürümse /v1'e düş
      if (/AI hatası \(404\)/.test(msg)) {
        return await v1Cagri(ayar.timeoutMs);
      }
      // Timeout/ağ hatası: bir kez daha dene (uzun soru + tünel gecikmesi için)
      if (erisilemezMi(ilk)) {
        return await yerelCagri(ayar.timeoutMs);
      }
      throw ilk;
    }
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
    const { text, usage } = await chat(model, messages, lang);
    return { text, usage, model, note: '' };
  } catch (e) {
    if (e && e.code === 'LOCAL_UNREACHABLE') {
      const { text, usage } = await chat(yedekModel, messages, lang);
      return { text, usage, model: yedekModel, note: '' };
    }
    const msg = String((e && e.message) || '');
    // Auth (401/403) ve bozuk istek (400) dışında her şeyde yedeği dene:
    // 404/410 (model kalkmış/tag yanlış), 422, 429, 5xx, timeout, bağlantı hatası,
    // VE yerel boş-cevap (thinking kapatılamamış) durumları.
    const olumcul = /401|403/.test(msg) || /AI hatası \(400\)/.test(msg);
    const yerelBosCevap = model.kind === 'local' && /boş cevap/i.test(msg);
    if (!olumcul && (yerelBosCevap || (model.kind === 'local' && model.key !== yedekModel.key))) {
      try { console.error(`Yerel yedek devreye giriyor (${model.key} -> ${yedekModel.key}): ${msg.slice(0, 160)}`); } catch {}
      const { text, usage } = await chat(yedekModel, messages, lang);
      return { text, usage, model: yedekModel, note: '' };
    }
    if (model.kind === 'nvidia' && !olumcul && model.key !== yedekModel.key) {
      const { text, usage } = await chat(yedekModel, messages, lang);
      return { text, usage, model: yedekModel, note: t(lang, 'ai.fallback.nvidia') };
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
// neden: null (hazır) | 'kapali' (/local kapatılmış) | 'adres-yok' (AI_BASE_URL eksik) | 'erisilemiyor' (tünel/PC kapalı)
async function yerelHazirMi() {
  if (!acikMi()) return { hazir: false, sayi: 0, neden: 'kapali' };
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return { hazir: false, sayi: 0, neden: 'adres-yok' };
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { hazir: false, sayi: 0, neden: 'erisilemiyor' };
    const data = await res.json();
    return { hazir: true, sayi: (data.models || []).length, neden: null };
  } catch {
    return { hazir: false, sayi: 0, neden: 'erisilemiyor' };
  }
}

module.exports = { chat, uretimYap, kuyrugaEkle, siraBilgisi, queueDepth, splitText, cooldownLeft, markCooldown, MAX_SORU, yerelHazirMi };
