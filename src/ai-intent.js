// AI yönetim niyet çözümleme (FAZ 2: ajan modeli seçilebilir).
// - Yerel ajan (9B): native /api/chat + tools (birincil), format:'json' yedeği.
// - NVIDIA ajan: OpenAI-uyumlu /v1/chat/completions + tools/tool_choice (birincil),
//   response_format json yedeği. Nemotron-thinking modellerde thinking kapatılır.
// - Dönen her sonuç katalog + ai-perms validasyonundan geçer (ai-yonetim.js yapar).
// - Sonuç: { op, args } | { eslesme: false } (yönetim değil/sohbet) | hata fırlatır.
const { sanitize } = require('./sanitize');
const { acikMi } = require('./local');
const { effectiveAgent, isChatEnabled, agentModelleri, allModels, AGENT_NVIDIA_SIRALI } = require('./ai-models');
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

// Ölü/kotalı yedek pas-geçme: 404/410 (yayından kalkmış) ve 429 (kota)
// alan aday, süresi dolana kadar zincirde atlanır. Böylece her istekte
// ölü modellere tekrar tekrar çarpılıp zaman kaybedilmez; dirilirse
// süre bitince otomatik döner.
const OLU_GECICI_MS = 5 * 60 * 1000; // 429 kotası
const OLU_KALICI_MS = 60 * 60 * 1000; // 404/410 yayından kalkma
const oluModeller = new Map(); // ad -> timestamp (ms)

function adayOlumu(ad) {
  const bitis = oluModeller.get(ad);
  if (!bitis) return false;
  if (bitis > Date.now()) return true;
  oluModeller.delete(ad);
  return false;
}

function adayOlduIsaretle(ad, kalici) {
  try {
    oluModeller.set(ad, Date.now() + (kalici ? OLU_KALICI_MS : OLU_GECICI_MS));
    console.log(`AI-YEDEK ${ad} pas geçilecek (${kalici ? '60 dk (ölü model)' : '5 dk (kota)'})`);
  } catch {}
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
    // Yerel ajan patladı (500/OOM, 404, boş cevap, tünel kopuk / Ollama kapalı):
    // NVIDIA yedek ajanları SIRAYLA dene. Tek modele bağlı kalınmazdı;
    // NVIDIA ölü modeli yayından kaldırınca (örn. kimi-k2 -> 410) zincir
    // sonraki canlı modele geçer, yönetim çalışmaya devam eder.
    const adaylar = nvidiaHedefListesi();
    if (!adaylar.length) {
      try { console.log(`AI-YEDEK yok (key/model yok), yerel hata taşınıyor`); } catch {}
      yerelHata.yedekHata = 'denenmedi (NVIDIA key yok veya ajan kapalı)';
      throw yerelHata;
    }
    // Yedek turu kısa tutulur: asılan tek model zinciri kilitlemesin.
    const yedekAyar = { ...ayar, timeoutMs: Math.min(ayar.timeoutMs, 60000) };
    const hatalar = [];
    let atlanan = 0;
    let hataSayisi = 0;
    for (const yh of adaylar) {
      if (adayOlumu(yh.ad)) { atlanan++; continue; }
      try {
        const n = await nvidiaNativeCozumle(yh, soru, lang, yedekAyar);
        if (n.op) { oluModeller.delete(yh.ad); return { op: n.op, args: n.args, yedek: yh.ad }; }
        const j = await nvidiaJsonCozumle(yh, soru, lang, yedekAyar);
        if (j.op) { oluModeller.delete(yh.ad); return { op: j.op, args: j.args, yedek: yh.ad }; }
        try { console.log(`AI-YEDEK ${yh.ad} eslesme-yok, sonrakine geçiliyor`); } catch {}
        hatalar.push(`${yh.ad}: eşleşme yok`);
      } catch (e2) {
        // 401/403 (key sorunu): diğer modelleri denemenin anlamı yok,
        // üstte ajanHata mesajına dönüşür.
        if (/401|403/.test(String((e2 && e2.message) || ''))) throw e2;
        hataSayisi++;
        const ym = String((e2 && e2.message) || e2).slice(0, 160);
        try { console.log(`AI-YEDEK ${yh.ad} hata: ${ym}`); } catch {}
        hatalar.push(`${yh.ad}: ${ym}`);
        // 404/410 (model yayından kalkmış) ve 429 (kota) -> bir süre pas geç.
        // Diğer hatalar (timeout/ağ) geçici sayılır, sadece sonrakine geçilir.
        if (/AI hatası \((404|410)\)/.test(ym)) adayOlduIsaretle(yh.ad, true);
        else if (/AI hatası \(429\)/.test(ym)) adayOlduIsaretle(yh.ad, false);
      }
    }
    // Hiçbir yedek HATA vermediyse (hepsi "yönetim değil" dedi): yerel yokluğunu
    // hata diye gösterme; dürüstçe "anlaşılamadı" dön, sohbet notla devam etsin.
    // (Yoksa "PC kapalı" hatası, aslında yönetim-olmayan soruya da çıkardı.)
    if (hataSayisi === 0 && atlanan === 0) return { eslesme: false };
    // Tüm yedekler patladı: orijinal yerel hatayı taşı (mesajlar doğru kalsın),
    // denenenlerin özeti teknik detay olarak eklenir.
    if (!hatalar.length && atlanan > 0) {
      yerelHata.yedekHata = `tüm yedekler yakın zamanda ölü/kotalı görüldü (${atlanan} model pas geçildi), birazdan tekrar dene`;
    } else {
      yerelHata.yedekHata = hatalar.join(' | ').slice(0, 300) || '?';
    }
    throw yerelHata;
  }
}

// Hızlı ön kontrol: Ollama'ya 5 sn'de ulaşılamıyorsa pahalı niyet
// çağrısını beklemeden yedeğe düş. (Tünel/PC kapalıyken istek,
// 120 sn'lik timeout'u boydan boya yiyip asılı kalıyordu.)
// Not: AbortController+setTimeout kullanılır; sinyal, bekleme bitene kadar
// kökten erişilebilir tutulur (inline AbortSignal.timeout, sinyali tutan
// olmazsa GC'ye yem olabilir).
async function yerelHizliKontrol(base) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 5000);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Yerel niyet denemesi: önce hızlı kontrol, sonra native tools -> format:json.
// Eşleşme yoksa { eslesme:false } döner (yedek denenmez); hatada fırlatır.
async function yerelDene(hedef, soru, lang, ayar) {
  if (!(await yerelHizliKontrol(hedef.base))) throw yerelUnreachable();
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

// NVIDIA yedek ajan adayları (sıralı liste): AGENT_NVIDIA_SIRALI önceliğiyle,
// sadece AÇIK nvidia ajanlar. Biri ölürse (404/410) sıradaki denenir.
// (Kullanıcı seçimine dokunmaz, sadece arıza yedeğidir.)
function nvidiaHedefListesi() {
  const key = (process.env.NVIDIA_API_KEY || '').trim();
  if (!key) return [];
  const acik = agentModelleri().filter(m => m.kind === 'nvidia' && isChatEnabled(m.key));
  const sira = new Map(AGENT_NVIDIA_SIRALI.map((k, i) => [k, i]));
  acik.sort((a, b) => (sira.has(a.key) ? sira.get(a.key) : 999) - (sira.has(b.key) ? sira.get(b.key) : 999));
  return acik.map(sec => ({
    yol: 'nvidia', model: sec.model, key,
    thinkingOff: sec.agentThinkingOff === true, ad: sec.key,
  }));
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

// Açılış öz-denetimi (erken uyarı): sorun istek anında değil, logda
// ilk dakikada görünsün. Hiç fırlatmaz; sadece raporlar.
// - Yerel: /local açık mı, tünele ulaşılıyor mu, ajan modeli Ollama'da var mı?
// - NVIDIA: key geçerli mi, kayıtlı model ID'leri listede mi
//   (yayından kalkan model kimi-k2/410 vakası gibi önceden yakalansın)?
async function baslangicKontrolu() {
  const notlar = [];
  // --- Yerel ---
  try {
    if (!acikMi()) {
      notlar.push('YEREL kapalı (/local kapatılmış) -> yönetim hep NVIDIA yedekle çalışır');
    } else {
      const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
      if (!base) {
        notlar.push('YEREL ADRES YOK (AI_BASE_URL eksik) -> yönetim hep NVIDIA yedekle çalışır');
      } else {
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
          notlar.push(`YEREL ULAŞILAMIYOR (tags HTTP ${res.status}) -> yönetim NVIDIA yedekle çalışır`);
        } else {
          const data = await res.json().catch(() => ({}));
          const adlar = Array.isArray(data.models) ? data.models.map(m => m.name || m.model).filter(Boolean) : [];
          let ajan = null;
          try { ajan = effectiveAgent(null); } catch {}
          if (ajan && ajan.kind === 'local') {
            const varMi = adlar.some(a => a === ajan.model || String(a).split(':')[0] === String(ajan.model).split(':')[0]);
            notlar.push(varMi
              ? `YEREL OK (${adlar.length} model, ajan ${ajan.model} mevcut)`
              : `YEREL AJAN EKSİK (${ajan.model} Ollama'da yok! PC'de: ollama pull ${ajan.model})`);
          } else {
            notlar.push(`YEREL OK (${adlar.length} model)`);
          }
        }
      }
    }
  } catch (e) {
    notlar.push(`YEREL ULAŞILAMIYOR (${String((e && e.message) || e).slice(0, 80)}) -> yönetim NVIDIA yedekle çalışır`);
  }
  // --- NVIDIA ---
  try {
    const key = (process.env.NVIDIA_API_KEY || '').trim();
    if (!key) {
      notlar.push('NVIDIA KEY YOK -> yerel ölürse yönetim çalışmaz! Railway Variables: NVIDIA_API_KEY');
    } else {
      const res = await fetch(`${NVIDIA_BASE}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401 || res.status === 403) {
        notlar.push('NVIDIA KEY GEÇERSİZ (401/403) -> yerel ölürse yönetim çalışmaz!');
      } else if (!res.ok) {
        notlar.push(`NVIDIA liste alınamadı (HTTP ${res.status}), yedek zincir istek anında belli olur`);
      } else {
        const data = await res.json().catch(() => ({}));
        const liste = new Set(Array.isArray(data.data) ? data.data.map(m => m.id) : []);
        const kayitli = allModels().filter(m => m.kind === 'nvidia').map(m => m.model);
        const kayip = [...new Set(kayitli.filter(id => liste.size && !liste.has(id)))];
        const acikAjan = agentModelleri().filter(m => m.kind === 'nvidia' && isChatEnabled(m.key)).length;
        notlar.push(`NVIDIA OK (key geçerli, ${liste.size || '?'} model, ${acikAjan} açık ajan)`);
        if (kayip.length) notlar.push(`NVIDIA'DA YOK (yayından kalkmış olabilir): ${kayip.join(', ')}`);
        if (!acikAjan) notlar.push('HİÇ AÇIK NVIDIA AJAN YOK -> yerel ölürse yönetim çalışmaz!');
      }
    }
  } catch (e) {
    notlar.push(`NVIDIA kontrol edilemedi (${String((e && e.message) || e).slice(0, 80)})`);
  }
  try {
    for (const n of notlar) console.log('AI-KONTROL ' + n);
  } catch {}
  return notlar;
}

module.exports = { cozumle, argDogrula, baslangicKontrolu };
