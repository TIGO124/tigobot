// OpenAI-uyumlu sohbet istemcisi.
// - kind 'local'  -> PC'deki Ollama (AI_BASE_URL), NVIDIA key kullanılmaz.
// - kind 'nvidia' -> NVIDIA API, sadece NVIDIA_API_KEY kullanılır.
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

async function callOpenAI(base, apiKey, model, messages) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI hatası (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
  if (!text) throw new Error('AI boş cevap verdi.');
  return text;
}

async function chat(model, messages) {
  if (model.kind === 'nvidia') {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
    }
    return callOpenAI(NVIDIA_BASE, process.env.NVIDIA_API_KEY, model.model, messages);
  }
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('Yerel model için AI_BASE_URL ayarlı değil. PCndeki tünel adresini Railway Variables kısmına AI_BASE_URL olarak ekle.');
  }
  return callOpenAI(base, process.env.LOCAL_API_KEY || null, model.model, messages);
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

module.exports = { chat, splitText };
