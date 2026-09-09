// NVIDIA Build üzerinden görsel üretim.
// Bulut API, sohbetten farklı olarak model-bazlı endpoint kullanır:
//   POST https://ai.api.nvidia.com/v1/genai/<model>
//   { prompt, width, height, seed, steps } -> { artifacts: [{ base64 }] }
// Birincil: FLUX.1-schnell (hızlı), yedek: FLUX.1-dev (kaliteli).
// Aynı global AI kuyruğu kullanılır, ayrı cooldown uygulanır (60 sn).
const { sanitize } = require('./sanitize');
const { load, save } = require('./store');

const GENAI_BASE = 'https://ai.api.nvidia.com/v1/genai';
const IMG_COOLDOWN_MS = 60 * 1000;
const MAX_PROMPT = 500;
// Bütçeler (env ile ezilebilir; testler kısa tutar):
// - deneme başına en fazla 150 sn (üretim + kuyruk için yeterli)
// - iş başına toplam en fazla 7 dk (Discord 15 dk etkileşim limitinin içinde)
function attemptMs() {
  const v = parseInt(process.env.IMG_ATTEMPT_MS, 10);
  return v > 0 ? v : 150000;
}
function deadlineMs() {
  const v = parseInt(process.env.IMG_DEADLINE_MS, 10);
  return v > 0 ? v : 7 * 60 * 1000;
}

// Desteklenen çözünürlükler model sayfasındaki listelerden (kare/dikey/yatay).
const IMG_MODELS = [
  { key: 'schnell', id: 'black-forest-labs/flux.1-schnell', steps: 4,
    name: { tr: 'FLUX-Schnell (hızlı)', en: 'FLUX-Schnell (fast)' },
    sizes: { square: { w: 1024, h: 1024 }, portrait: { w: 768, h: 1344 }, landscape: { w: 1344, h: 768 } } },
  { key: 'dev', id: 'black-forest-labs/flux.1-dev', steps: 25,
    name: { tr: 'FLUX-Dev (kaliteli)', en: 'FLUX-Dev (quality)' },
    sizes: { square: { w: 1024, h: 1024 }, portrait: { w: 768, h: 1344 }, landscape: { w: 1344, h: 768 } } },
  { key: 'klein', id: 'black-forest-labs/flux.2-klein-4b', steps: 4,
    name: { tr: 'FLUX-Klein (en yeni)', en: 'FLUX-Klein (newest)' },
    sizes: { square: { w: 1024, h: 1024 }, portrait: { w: 832, h: 1248 }, landscape: { w: 1248, h: 832 } } },
];

function findImgModel(key) {
  return IMG_MODELS.find(m => m.key === key) || IMG_MODELS[0];
}

function imgModelName(m, lang) {
  if (!m) return '';
  const L = lang === 'en' ? 'en' : 'tr';
  return (m.name && (m.name[L] || m.name.tr)) || m.id;
}

function imgOffList() {
  const s = load('models.json', {});
  return Array.isArray(s.imgOff) ? s.imgOff : [];
}

function setImgEnabled(key, enabled) {
  if (!IMG_MODELS.some(m => m.key === key)) return false;
  const s = load('models.json', {});
  const off = new Set(Array.isArray(s.imgOff) ? s.imgOff : []);
  if (enabled) off.delete(key); else off.add(key);
  s.imgOff = [...off];
  save('models.json', s);
  return true;
}

function isImgEnabled(key) {
  return !imgOffList().includes(key);
}

function enabledImgModels() {
  const acik = IMG_MODELS.filter(m => isImgEnabled(m.key));
  return acik.length ? acik : [...IMG_MODELS]; // hepsi kapalıysa kilitlenme olmasın
}

// Global görsel model (sadece owner/panel seçer)
function getGlobalImgModel() {
  const s = load('models.json', {});
  const m = findImgModel(s.globalImg);
  return isImgEnabled(m.key) ? m : enabledImgModels()[0];
}

function setGlobalImgModel(key) {
  const m = IMG_MODELS.find(x => x.key === key);
  if (!m || !isImgEnabled(m.key)) return null;
  const s = load('models.json', {});
  s.globalImg = m.key;
  save('models.json', s);
  return m;
}

// Sunucuya özel görsel model (null = globale dön). models.json: { guildImg: {gid:key} }
function getGuildImgModelKey(guildId) {
  if (!guildId) return null;
  const g = load('models.json', {}).guildImg || {};
  return typeof g[guildId] === 'string' ? g[guildId] : null;
}

function setGuildImgModel(guildId, key) {
  if (!guildId) return null;
  if (key !== null) {
    const m = IMG_MODELS.find(x => x.key === key);
    if (!m || !isImgEnabled(m.key)) return null;
  }
  const s = load('models.json', {});
  s.guildImg = s.guildImg && typeof s.guildImg === 'object' ? s.guildImg : {};
  if (key === null) delete s.guildImg[guildId];
  else s.guildImg[guildId] = key;
  save('models.json', s);
  return key === null ? getGlobalImgModel() : findImgModel(key);
}

// Efektif görsel model: sunucu özeli (açıksa) -> global -> ilk açık
function effectiveImgModel(guildId) {
  const gk = getGuildImgModelKey(guildId);
  if (gk) {
    const m = findImgModel(gk);
    if (m && isImgEnabled(m.key)) return m;
  }
  return getGlobalImgModel();
}

async function callImage(model, prompt, size, budgetMs) {
  const apiKey = (process.env.NVIDIA_API_KEY || '').trim();
  if (!apiKey) throw new Error('NVIDIA_API_KEY ayarlı değil. Railway Variables kısmına ekle.');
  const { w, h } = (model.sizes && model.sizes[size]) || model.sizes.square;
  const payload = JSON.stringify({
    prompt,
    width: w,
    height: h,
    seed: Math.floor(Math.random() * 1000000),
    steps: model.steps,
  });
  const limit = Math.max(5000, Math.min(attemptMs(), budgetMs));
  // Ağ dalgalanmasına karşı en fazla 2 deneme (sadece bağlantı hatalarında; HTTP 4xx'te değil)
  let lastNetErr = null;
  for (let deneme = 1; deneme <= 2; deneme++) {
    let res;
    try {
      res = await fetch(`${GENAI_BASE}/${model.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: payload,
        signal: AbortSignal.timeout(limit),
      });
    } catch (e) {
      lastNetErr = e;
      if (deneme < 2 && budgetMs > 45000) await new Promise(r => setTimeout(r, 2000));
      else break;
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(sanitize(`Görsel hatası (${res.status}): ${body.slice(0, 200)}`));
    }
    const data = await res.json();
    // Bulut formatı: { artifacts: [{ base64 }] } + olası alternatifler
    const art = data.artifacts && data.artifacts[0];
    const b64 = (art && (art.base64 || art.image)) || (data.data && data.data[0] && data.data[0].b64_json);
    if (b64) return { buffer: Buffer.from(b64, 'base64'), model: model.id };
    const url = (data.data && data.data[0] && data.data[0].url) || data.url;
    if (url) {
      const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!img.ok) throw new Error('Görsel indirilemedi.');
      return { buffer: Buffer.from(await img.arrayBuffer()), model: model.id };
    }
    throw new Error('AI boş cevap verdi.');
  }
  throw lastNetErr || new Error('Görsel üretilemedi (bağlantı kurulamadı).');
}

async function generateImage(prompt, size, guildId) {
  // Sunucu özeli önce, sonra global, sonra diğer AÇIK modeller yedek (key hatasında durulur).
  // Toplam bütçe aşılırsa zaman aşımı hatası verilir (sonsuz "oluşturuluyor" yok).
  const baslangic = Date.now();
  const kalan = () => deadlineMs() - (Date.now() - baslangic);
  const havuz = enabledImgModels();
  const ilk = havuz.find(m => m.key === effectiveImgModel(guildId).key) || havuz[0];
  const sira = [ilk, ...havuz.filter(m => m.key !== ilk.key)];
  let lastErr = null;
  for (const m of sira) {
    if (kalan() <= 5000) break;
    try {
      return await callImage(m, prompt, size, kalan());
    } catch (e) {
      lastErr = e;
      // Key hatasında diğer modeli denemenin anlamı yok, dur
      if (/401|403/.test(e.message || '')) throw e;
    }
  }
  if (lastErr && /401|403|NVIDIA_API_KEY|400|404|422/.test(lastErr.message || '')) throw lastErr;
  const dk = Math.round(deadlineMs() / 60000);
  const sure = dk >= 1 ? `${dk} dk` : `${Math.round(deadlineMs() / 1000)} sn`;
  throw new Error(sanitize(`Görsel zaman aşımı (${sure}): NVIDIA şu anda cevap vermiyor. ${lastErr ? String(lastErr.message || '').slice(0, 120) : ''}`));
}

// Görsele özel FIFO kuyruk (metin kuyruğundan ayrı: asılan görsel /ai'yi bloklamaz).
const imgBekleyenler = [];
let imgAktif = null;
let imgSayac = 0;

function imgSiradaki() {
  if (imgAktif) return;
  const job = imgBekleyenler.shift();
  if (!job) return;
  imgAktif = job;
  job.is().then(
    sonuc => { imgAktif = null; job.resolve(sonuc); imgSiradaki(); },
    hata => { imgAktif = null; job.reject(hata); imgSiradaki(); }
  );
}

function imgKuyrugaEkle(userId, userTag, is) {
  const job = { id: ++imgSayac, userId, userTag, is, resolve: null, reject: null };
  const sonuc = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  imgBekleyenler.push(job);
  imgSiradaki();
  return { jobId: job.id, sonuc };
}

function imgSiraBilgisi(jobId) {
  if (imgAktif && imgAktif.id === jobId) return { sira: 1, toplam: imgBekleyenler.length + 1 };
  const idx = imgBekleyenler.findIndex(j => j.id === jobId);
  if (idx === -1) return null;
  return { sira: idx + 2, toplam: imgBekleyenler.length + 1 };
}

function imgQueueDepth() {
  return imgBekleyenler.length + (imgAktif ? 1 : 0);
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

module.exports = { generateImage, findImgModel, imgModelName, enabledImgModels, isImgEnabled, setImgEnabled, getGlobalImgModel, setGlobalImgModel, getGuildImgModelKey, setGuildImgModel, effectiveImgModel, imgKuyrugaEkle, imgSiraBilgisi, imgQueueDepth, imgCooldownLeft, markImgCooldown, MAX_PROMPT, IMG_MODELS };
