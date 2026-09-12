// AI yönetim niyet çözümleme (FAZ 2: ajan modeli seçilebilir).
// - Yerel ajan (9B): native /api/chat + tools (birincil), format:'json' yedeği.
// - NVIDIA ajan: OpenAI-uyumlu /v1/chat/completions + tools/tool_choice (birincil),
//   response_format json yedeği. Nemotron-thinking modellerde thinking kapatılır.
// - Dönen her sonuç katalog + ai-perms validasyonundan geçer (ai-yonetim.js yapar).
// - Sonuç: { op, args } | { eslesme: false } (yönetim değil/sohbet) | hata fırlatır.
const { sanitize } = require('./sanitize');
const { acikMi } = require('./local');
const { effectiveAgent, findModel, isChatEnabled, agentModelleri } = require('./ai-models');
const { KATALOG, toolListesi } = require('./ai-actions');
const { isOpEnabled } = require('./ai-perms');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

function intentAyar() {
  const t = parseInt(process.env.AI_INTENT_TIMEOUT_MS, 10);
  return {
    timeoutMs: Number.isFinite(t) ? Math.min(300000, Math.max(30000, t)) : 120000,
    // Niyet çözümleme kısa iştir; 8192 ctx 9B'de KV baskısı yapar (4B ile
    // aynı VRAM'de şişince 500/OOM olur). 4096 fazlasıyla yeter.
    numCtx: 4096,
  };
}

// Ajan hedefini çöz: { yol: 'local', base, model } | { yol: 'nvidia', model, thinkingOff }
function ajanHedef(guildId) {
  const ajan = effectiveAgent(guildId);
  if (ajan.kind === 'nvidia') {
    const key = (process.env.NVIDIA_API_KEY || '').trim();
    if (!key) throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
    return { yol: 'nvidia', model: ajan.model, key, thinkingOff: ajan.agentThinkingOff === true };
  }
  if (!acikMi()) {
    const err = new Error('LOCAL_UNREACHABLE');
    err.code = 'LOCAL_UNREACHABLE';
    throw err;
  }
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    const err = new Error('LOCAL_UNREACHABLE');
    err.code = 'LOCAL_UNREACHABLE';
    throw err;
  }
  return { yol: 'local', base, model: ajan.model };
}

function yerelUnreachable() {
  const err = new Error('LOCAL_UNREACHABLE');
  err.code = 'LOCAL_UNREACHABLE';
  return err;
}

// Ağ/timeout hatası mı? (tünel kapalı, PC kapalı, süre aşımı)
// 502/503/504: Ollama kapalı ama tünel ayakta -> gateway hatası = ulaşılamaz.
// (Ollama'nın kendi 500'ü hariç; o model/VRAM sorunudur.)
function agHatasiMi(e) {
  if (!e) return false;
  if (e.code === 'LOCAL_UNREACHABLE') return true;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  if (e instanceof TypeError) return true;
  const m = String(e.message || '');
  if (/AI hatası \(50[234]\)/.test(m)) return true;
  return /fetch failed|connect|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EPIPE|timeout|aborted|socket hang up/i.test(m);
}

function sistemDili(lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  return L === 'en'
    ? 'You are TigoBot, a Discord server management assistant created by caglar_007. The user asks in natural language to manage the server. Use ONLY the provided tools for management requests. If the request is NOT a server management task (normal chat, question, joke), do NOT call any tool. Never invent operations outside the tool list. /no_think'
    : 'Sen caglar_007 tarafından yapılan TigoBot, Discord sunucu yönetim asistanısın. Kullanıcı sunucuyu yönetmek için doğal dille yazar. Yönetim isteklerinde SADECE verilen araçları kullan. İstek sunucu yönetimi DEĞİLSE (normal sohbet, soru, espri) HİÇBİR araç çağırma. Liste dışı işlem uydurma. /no_think';
}

function argDogrula(op, args) {
  const giris = KATALOG[op];
  if (!giris) return null;
  const duz = {};
  const gerekli = (giris.tool.parameters && giris.tool.parameters.required) || [];
  const ozellik = (giris.tool.parameters && giris.tool.parameters.properties) || {};
  const ham = (args && typeof args === 'object') ? args : {};
  for (const k of Object.keys(ozellik)) {
    const v = ham[k];
    if (v === undefined || v === null) continue;
    const tip = ozellik[k].type;
    if (tip === 'integer') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) duz[k] = n;
    } else if (tip === 'array') {
      if (Array.isArray(v)) {
        const min = Number.isFinite(ozellik[k].minItems) ? ozellik[k].minItems : 0;
        const dizi = v.map(x => String(x)).slice(0, 4);
        if (dizi.length >= min) duz[k] = dizi;
      }
    } else {
      duz[k] = String(v).slice(0, 1500);
    }
  }
  for (const k of gerekli) {
    if (duz[k] === undefined || duz[k] === '' || (Array.isArray(duz[k]) && !duz[k].length)) return null;
  }
  return duz;
}

async function nativeCozumle(base, model, soru, lang, ayar) {
  const tools = toolListesi(op => isOpEnabled(op.tool.name, KATALOG));
  if (!tools.length) return { eslesme: false };
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sistemDili(lang) },
        { role: 'user', content: String(soru).slice(0, 1000) },
      ],
      stream: false,
      think: false,
      keep_alive: '10m',
      options: { num_ctx: ayar.numCtx, num_predict: 512, temperature: 0.2 },
      tools,
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(ayar.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const cagrilar = (data.message && data.message.tool_calls) || [];
  if (!cagrilar.length) return { eslesme: false };
  const ilk = cagrilar[0] || {};
  const fn = ilk.function || {};
  const op = String(fn.name || '');
  if (!KATALOG[op] || !isOpEnabled(op, KATALOG)) return { eslesme: false };
  let args = {};
  try { args = JSON.parse(fn.arguments || '{}'); } catch { return { eslesme: false }; }
  const duz = argDogrula(op, args);
  if (!duz) return { eslesme: false };
  return { op, args: duz };
}

async function jsonCozumle(base, model, soru, lang, ayar) {
  const opAdlari = Object.keys(KATALOG).filter(op => isOpEnabled(op, KATALOG)).join(', ');
  const sema = opAdlari.length ? opAdlari : 'hicbiri';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sistemDili(lang) + ` Yönetim isteğiyse SADECE şu JSON'u yaz: {"op":"<${sema}>","args":{...}}. Yönetim değilse SADECE şunu yaz: {"op":"sohbet"}. Başka hiçbir şey yazma. /no_think` },
        { role: 'user', content: String(soru).slice(0, 1000) },
      ],
      stream: false,
      think: false,
      keep_alive: '10m',
      format: 'json',
      options: { num_ctx: ayar.numCtx, num_predict: 256, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(ayar.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const ham = String((data.message && data.message.content) || '').trim();
  let j = null;
  try { j = JSON.parse(ham); } catch { return { eslesme: false }; }
  if (!j || j.op === 'sohbet' || !KATALOG[j.op] || !isOpEnabled(j.op, KATALOG)) return { eslesme: false };
  const duz = argDogrula(j.op, j.args);
  if (!duz) return { eslesme: false };
  return { op: j.op, args: duz };
}

// Ana giriş: önce native tools, sonuç yoksa JSON yedeği.
// guildId -> efektif ajan (sunucu seçimi -> global -> 9B).
async function cozumle(soru, lang, guildId) {
  const hedef = ajanHedef(guildId || null);
  const ayar = intentAyar();
  if (hedef.yol === 'nvidia') {
    try {
      const n = await nvidiaNativeCozumle(hedef, soru, lang, ayar);
      if (n.op) return n;
    } catch (e) {
      const msg = String((e && e.message) || '');
      if (/401|403/.test(msg)) throw e;
      // Diğer hatalarda JSON yedeğini dene
    }
    return nvidiaJsonCozumle(hedef, soru, lang, ayar);
  }
  try {
    return await yerelDene(hedef, soru, lang, ayar);
  } catch (yerelHata) {
    // Yerel ajan patladı (500/OOM, 404, boş cevap, tünel kopuk):
    // NVIDIA yedek ajan dene (önce kimi-k2, yoksa ilk açık nvidia ajan).
    const yh = nvidiaHedefiBul();
    if (!yh) {
      try { console.log(`AI-YEDEK yok (key/model yok), yerel hata taşınıyor`); } catch {}
      throw yerelHata;
    }
    try {
      const n = await nvidiaNativeCozumle(yh, soru, lang, ayar);
      if (n.op) return { op: n.op, args: n.args, yedek: yh.ad };
      const j = await nvidiaJsonCozumle(yh, soru, lang, ayar);
      if (j.op) return { op: j.op, args: j.args, yedek: yh.ad };
      try { console.log(`AI-YEDEK ${yh.ad} eslesme-yok, yerel hata taşınıyor`); } catch {}
    } catch (e2) {
      // 401/403 (key sorunu) üstte ajanHata mesajına dönüşür
      if (/401|403/.test(String((e2 && e2.message) || ''))) throw e2;
      try { console.log(`AI-YEDEK ${yh.ad} hata: ${String((e2 && e2.message) || e2).slice(0, 200)}`); } catch {}
      // Yedek de patladı: orijinal yerel hatayı taşı (mesajlar doğru kalsın)
    }
    throw yerelHata;
  }
}

// Yerel niyet denemesi: native tools -> format:json.
// Eşleşme yoksa { eslesme:false } döner (yedek denenmez); hatada fırlatır.
async function yerelDene(hedef, soru, lang, ayar) {
  try {
    const n = await nativeCozumle(hedef.base, hedef.model, soru, lang, ayar);
    if (n.op) return n;
  } catch (e) {
    // Native hata (404 eski sürüm, 400 tools-desteksiz, 500 model sorunu):
    // önce JSON yedeği denenir.
    if (!agHatasiMi(e)) {
      try {
        return await jsonCozumle(hedef.base, hedef.model, soru, lang, ayar);
      } catch (e2) {
        if (!agHatasiMi(e2)) throw e;
      }
    }
    throw yerelUnreachable();
  }
  try {
    return await jsonCozumle(hedef.base, hedef.model, soru, lang, ayar);
  } catch (e) {
    if (agHatasiMi(e)) throw yerelUnreachable();
    throw e;
  }
}

// NVIDIA yedek ajan hedefi (kullanıcı seçimine dokunmaz, sadece arıza yedeği).
function nvidiaHedefiBul() {
  const key = (process.env.NVIDIA_API_KEY || '').trim();
  if (!key) return null;
  const kimi = findModel('nvidia-kimi-k2');
  const sec = (kimi && kimi.agent === true && isChatEnabled(kimi.key))
    ? kimi
    : agentModelleri().find(m => m.kind === 'nvidia' && isChatEnabled(m.key));
  if (!sec) return null;
  return { yol: 'nvidia', model: sec.model, key, thinkingOff: sec.agentThinkingOff === true, ad: sec.key };
}

// NVIDIA native tools yolu (OpenAI-uyumlu).
async function nvidiaNativeCozumle(hedef, soru, lang, ayar) {
  const tools = toolListesi(op => isOpEnabled(op.tool.name, KATALOG));
  if (!tools.length) return { eslesme: false };
  const govde = {
    model: hedef.model,
    messages: [
      { role: 'system', content: sistemDili(lang) },
      { role: 'user', content: String(soru).slice(0, 1000) },
    ],
    temperature: 0.2,
    max_tokens: 512,
    tools,
    tool_choice: 'auto',
  };
  if (hedef.thinkingOff) govde.reasoning_effort = 'none';
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hedef.key}` },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(ayar.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
  const cagrilar = msg.tool_calls || [];
  if (!cagrilar.length) return { eslesme: false };
  const fn = (cagrilar[0] && cagrilar[0].function) || {};
  const op = String(fn.name || '');
  if (!KATALOG[op] || !isOpEnabled(op, KATALOG)) return { eslesme: false };
  let args = {};
  try { args = JSON.parse(fn.arguments || '{}'); } catch { return { eslesme: false }; }
  const duz = argDogrula(op, args);
  if (!duz) return { eslesme: false };
  return { op, args: duz };
}

// NVIDIA JSON yedeği.
async function nvidiaJsonCozumle(hedef, soru, lang, ayar) {
  const opAdlari = Object.keys(KATALOG).filter(op => isOpEnabled(op, KATALOG)).join(', ');
  const govde = {
    model: hedef.model,
    messages: [
      { role: 'system', content: sistemDili(lang) + ` Yönetim isteğiyse SADECE şu JSON'u yaz: {"op":"<${opAdlari}>","args":{...}}. Yönetim değilse SADECE şunu yaz: {"op":"sohbet"}. Başka hiçbir şey yazma.` },
      { role: 'user', content: String(soru).slice(0, 1000) },
    ],
    temperature: 0.1,
    max_tokens: 256,
    response_format: { type: 'json_object' },
  };
  if (hedef.thinkingOff) govde.reasoning_effort = 'none';
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hedef.key}` },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(ayar.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(sanitize(`AI hatası (${res.status}): ${body.slice(0, 200)}`));
  }
  const data = await res.json();
  const ham = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
  let j = null;
  try { j = JSON.parse(ham); } catch { return { eslesme: false }; }
  if (!j || j.op === 'sohbet' || !KATALOG[j.op] || !isOpEnabled(j.op, KATALOG)) return { eslesme: false };
  const duz = argDogrula(j.op, j.args);
  if (!duz) return { eslesme: false };
  return { op: j.op, args: duz };
}

module.exports = { cozumle, argDogrula };
