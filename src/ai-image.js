// NVIDIA NIM üzerinden görsel üretim (OpenAI-uyumlu /images/generations).
// Birincil: FLUX.1-schnell (hızlı), yedek: FLUX.1-dev (kaliteli).
// Aynı global AI kuyruğu kullanılır, ayrı cooldown uygulanır (60 sn).
const { sanitize } = require('./sanitize');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const IMG_COOLDOWN_MS = 60 * 1000;
const MAX_PROMPT = 500;

const IMG_MODELS = [
  'black-forest-labs/flux.1-schnell',
  'black-forest-labs/flux.1-dev',
];

async function callImage(model, prompt, size) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
  const [w, h] = size === 'portrait' ? [768, 1344]
    : size === 'landscape' ? [1344, 768]
    : [1024, 1024];
  const res = await fetch(`${NVIDIA_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: `${w}x${h}`, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`Görsel hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const item = data.data && data.data[0];
  if (!item) throw new Error('AI boş cevap verdi.');
  if (item.b64_json) return { buffer: Buffer.from(item.b64_json, 'base64'), model };
  if (item.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
    if (!img.ok) throw new Error('Görsel indirilemedi.');
    return { buffer: Buffer.from(await img.arrayBuffer()), model };
  }
  throw new Error('AI boş cevap verdi.');
}

async function generateImage(prompt, size) {
  let lastErr = null;
  for (const m of IMG_MODELS) {
    try {
      return await callImage(m, prompt, size);
    } catch (e) {
      lastErr = e;
      // 404/422 gibi model hatasında diğerini dene, key hatasında dur
      if (/401|403/.test(e.message || '')) throw e;
    }
  }
  throw lastErr || new Error('Görsel üretilemedi.');
}

// Ayrı cooldown: görsel üretim pahalı, 60 sn
const beklemeImg = new Map();
function imgCooldownLeft(userId, guildId) {
  const k = guildId ? `${guildId}:${userId}` : `dm:${userId}`;
  const kalan = IMG_COOLDOWN_MS - (Date.now() - (beklemeImg.get(k) || 0));
  return kalan > 0 ? Math.ceil(kalan / 1000) : 0;
}
function markImgCooldown(userId, guildId) {
  if (beklemeImg.size > 5000) beklemeImg.clear();
  beklemeImg.set(guildId ? `${guildId}:${userId}` : `dm:${userId}`, Date.now());
}

module.exports = { generateImage, imgCooldownLeft, markImgCooldown, MAX_PROMPT, IMG_MODELS };
