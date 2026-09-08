// OpenAI-uyumlu sohbet istemcisi.
// - kind 'local'  -> PC'deki Ollama (AI_BASE_URL), NVIDIA key kullanılmaz.
// - kind 'nvidia' -> NVIDIA API, sadece NVIDIA_API_KEY kullanılır.
// - Yerel servise ulaşılamazsa LOCAL_UNREACHABLE hatası verir (yedek için).
// - Tüm istekler tek kuyruktan FIFO sırayla geçer.
const { sanitize } = require('./sanitize');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const SYSTEM_PROMPT = 'Sen TigoBot adında, Türkçe konuşan, yardımsever ve öz cevaplar veren bir Discord botusun.';
const BEKLEME_MS = 20 * 1000;
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

async function chat(model, messages) {
  const tum = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
  if (model.kind === 'nvidia') {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
    }
    return callOpenAI(NVIDIA_BASE, process.env.NVIDIA_API_KEY, model.model, tum, 180000);
  }
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    // Tünel adresi yoksa yerel servis kapalı sayılır -> nvidia yedeğe düşer
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

// FIFO kuyruk: bir istek bitmeden diğeri başlamaz.
let kuyruk = Promise.resolve();
function enqueue(is) {
  const calis = kuyruk.then(is, is);
  kuyruk = calis.catch(() => {});
  return calis;
}

function chatWithFallback(model, yedekModel, messages) {
  return enqueue(async () => {
    try {
      const text = await chat(model, messages);
      return { text, model, fallback: false, note: '' };
    } catch (e) {
      if (e && e.code === 'LOCAL_UNREACHABLE') {
        const text = await chat(yedekModel, messages);
        return { text, model: yedekModel, fallback: true, note: 'Yerel servise şu anda ulaşılamıyor, yedek model ile cevaplanıyor.' };
      }
      // Seçili nvidia model hesaba kapalıysa (404) varsayılan modele düş
      if (model.kind === 'nvidia' && /\(404\)/.test(e.message || '') && model.key !== yedekModel.key) {
        const text = await chat(yedekModel, messages);
        return { text, model: yedekModel, fallback: true, note: 'Seçili modele şu anda ulaşılamıyor, yedek model ile cevaplanıyor.' };
      }
      throw e;
    }
  });
}

// Kredi/spam koruması: kullanıcı başına bekleme süresi
const bekleme = new Map();
function cooldownLeft(userId) {
  const kalan = BEKLEME_MS - (Date.now() - (bekleme.get(userId) || 0));
  return kalan > 0 ? Math.ceil(kalan / 1000) : 0;
}
function markCooldown(userId) {
  bekleme.set(userId, Date.now());
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

module.exports = { chat, chatWithFallback, enqueue, splitText, cooldownLeft, markCooldown, MAX_SORU };
