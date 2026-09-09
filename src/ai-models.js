const { load, save } = require('./store');

const STATE_DOSYA = 'models.json';

function kapaliListesi() {
  const s = load(STATE_DOSYA, {});
  return {
    chat: Array.isArray(s.chatOff) ? s.chatOff : [],
    img: Array.isArray(s.imgOff) ? s.imgOff : [],
  };
}

// Dashboard'dan aç/kapa: kapalı modeller /aimodels ve /ai-gorsel'de görünmez,
// kayıtlı seçimi kapalı olan kullanıcı varsayılana düşer.
function setChatEnabled(key, enabled) {
  if (!findModel(key)) return false;
  const s = load(STATE_DOSYA, {});
  const off = new Set(Array.isArray(s.chatOff) ? s.chatOff : []);
  if (enabled) off.delete(key); else off.add(key);
  s.chatOff = [...off];
  save(STATE_DOSYA, s);
  return true;
}

function isChatEnabled(key) {
  return !kapaliListesi().chat.includes(key);
}

function enabledModels() {
  return allModels().filter(m => isChatEnabled(m.key));
}

// Yerel modeller PC'deki Ollama üzerinden çalışır (AI_BASE_URL).
// Ollama'daki model adların farklıysa Railway'de AI_MODEL_4B / AI_MODEL_9B ile ezebilirsin.
// NVIDIA modelleri build.nvidia.com adresinden alınır (integrate.api.nvidia.com/v1).
function allModels() {
  return [
    { key: 'qwen35-4b', name: { tr: 'Qwen3.5-4B (yerel)', en: 'Qwen3.5-4B (local)' }, kind: 'local', model: process.env.AI_MODEL_4B || 'qwen3.5:4b' },
    { key: 'qwen35-9b', name: { tr: 'Qwen3.5-9B (yerel)', en: 'Qwen3.5-9B (local)' }, kind: 'local', model: process.env.AI_MODEL_9B || 'qwen3.5:9b' },
    { key: 'nvidia-gpt-oss', name: { tr: 'GPT-OSS-20B', en: 'GPT-OSS-20B' }, kind: 'nvidia', model: 'openai/gpt-oss-20b' },
    { key: 'nvidia-gpt-oss-120b', name: { tr: 'GPT-OSS-120B (güçlü)', en: 'GPT-OSS-120B (strong)' }, kind: 'nvidia', model: 'openai/gpt-oss-120b' },
    { key: 'nvidia-kimi-k2', name: { tr: 'Kimi-K2 (kod + ajan)', en: 'Kimi-K2 (code + agent)' }, kind: 'nvidia', model: 'moonshotai/kimi-k2-instruct' },
    { key: 'nvidia-nemotron-super', name: { tr: 'Nemotron-Super-49B (akıl yürütme)', en: 'Nemotron-Super-49B (reasoning)' }, kind: 'nvidia', model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5' },
    { key: 'nvidia-llama-nemotron-70b', name: { tr: 'Llama-Nemotron-70B', en: 'Llama-Nemotron-70B' }, kind: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    { key: 'nvidia-llama33', name: { tr: 'Llama-3.3-70B', en: 'Llama-3.3-70B' }, kind: 'nvidia', model: 'meta/llama-3.3-70b-instruct' },
    { key: 'nvidia-deepseek-r1', name: { tr: 'DeepSeek-R1 (derin düşünme)', en: 'DeepSeek-R1 (deep thinking)' }, kind: 'nvidia', model: 'deepseek-ai/deepseek-r1' },
    { key: 'nvidia-qwen-coder', name: { tr: 'Qwen-Coder-32B (kod)', en: 'Qwen-Coder-32B (code)' }, kind: 'nvidia', model: 'qwen/qwen2.5-coder-32b-instruct' },
    { key: 'nvidia-qwen35', name: { tr: 'Qwen3.5-122B (devasa)', en: 'Qwen3.5-122B (huge)' }, kind: 'nvidia', model: 'qwen/qwen3.5-122b-a10b' },
    { key: 'nvidia-deepseek-v4', name: { tr: 'DeepSeek-V4-Pro (kod)', en: 'DeepSeek-V4-Pro (code)' }, kind: 'nvidia', model: 'deepseek-ai/deepseek-v4-pro-0813' },
    { key: 'nvidia-nano-9b', name: { tr: 'Nemotron-Nano-9B (akıl yürütme)', en: 'Nemotron-Nano-9B (reasoning)' }, kind: 'nvidia', model: 'nvidia/nvidia-nemotron-nano-9b-v2' },
    { key: 'nvidia-mini-4b', name: { tr: 'Nemotron-Mini-4B (hafif)', en: 'Nemotron-Mini-4B (light)' }, kind: 'nvidia', model: 'nvidia/nemotron-mini-4b-instruct' },
    { key: 'nvidia-mistral-nemotron', name: { tr: 'Mistral-Nemotron (ajan)', en: 'Mistral-Nemotron (agent)' }, kind: 'nvidia', model: 'mistralai/mistral-nemotron' },
    { key: 'nvidia-mixtral', name: { tr: 'Mixtral-8x7B (hızlı)', en: 'Mixtral-8x7B (fast)' }, kind: 'nvidia', model: 'mistralai/mixtral-8x7b-instruct-v0.1' },
    { key: 'nvidia-gemma', name: { tr: 'Gemma-2-9B (hafif)', en: 'Gemma-2-9B (light)' }, kind: 'nvidia', model: 'google/gemma-2-9b-it' },
    { key: 'nvidia-llama-vision', name: { tr: 'Llama-3.2-11B', en: 'Llama-3.2-11B' }, kind: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' },
    { key: 'nvidia-lightning', name: { tr: 'Nemotron-Lightning-30B (en hızlı)', en: 'Nemotron-Lightning-30B (fastest)' }, kind: 'nvidia', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  ];
}

function modelName(m, lang) {
  if (!m) return '';
  if (typeof m.name === 'string') return m.name;
  return (m.name && (m.name[lang] || m.name.tr)) || m.key;
}

function findModel(key) {
  return allModels().find(m => m.key === key) || null;
}

function defaultModel() {
  return allModels()[0];
}

function getUserModel(userId) {
  // ARTIK KULLANILMIYOR (kullanıcı bazlı seçim kaldırıldı, global+sunucu var).
  // Eski kayıtlar sessizce yok sayılır, geriye uyumluluk için tutuldu.
  return effectiveModel(null);
}

// Sadece geçerli VE açık anahtar; değilse null (hayalet kayıt yok)
function setUserModel(userId, key) {
  const m = findModel(key);
  if (!m || !isChatEnabled(m.key)) return null;
  return m;
}

// --- Global + sunucu-bazlı seçim (sadece owner/panel) ---
// models.json: { chatOff:[], imgOff:[], globalChat: key, guildChat: {gid:key} }
function stateOku() {
  return load(STATE_DOSYA, {});
}

function guvenliModel(m) {
  if (m && isChatEnabled(m.key)) return m;
  const acik = enabledModels();
  return acik[0] || allModels()[0];
}

function getGlobalModel() {
  return guvenliModel(findModel(stateOku().globalChat));
}

function setGlobalModel(key) {
  const m = findModel(key);
  if (!m || !isChatEnabled(m.key)) return null;
  const s = stateOku();
  s.globalChat = m.key;
  save(STATE_DOSYA, s);
  return m;
}

function getGuildModelKey(guildId) {
  if (!guildId) return null;
  const g = stateOku().guildChat || {};
  return typeof g[guildId] === 'string' ? g[guildId] : null;
}

function setGuildModel(guildId, key) {
  if (!guildId) return null;
  if (key !== null) {
    const m = findModel(key);
    if (!m || !isChatEnabled(m.key)) return null;
  }
  const s = stateOku();
  s.guildChat = s.guildChat && typeof s.guildChat === 'object' ? s.guildChat : {};
  if (key === null) delete s.guildChat[guildId];
  else s.guildChat[guildId] = key;
  save(STATE_DOSYA, s);
  return key === null ? getGlobalModel() : findModel(key);
}

// Efektif model: sunucu özel seçimi (açıksa) -> global -> ilk açık
function effectiveModel(guildId) {
  const gk = getGuildModelKey(guildId);
  if (gk) {
    const m = findModel(gk);
    if (m && isChatEnabled(m.key)) return m;
  }
  return getGlobalModel();
}

// Yerel servis kapalıyken cevap verecek yedek: listedeki ilk AÇIK nvidia modeli
function defaultNvidia() {
  return enabledModels().find(m => m.kind === 'nvidia') || defaultModel();
}

module.exports = { allModels, enabledModels, findModel, getUserModel, setUserModel, getGlobalModel, setGlobalModel, getGuildModelKey, setGuildModel, effectiveModel, defaultModel, defaultNvidia, modelName, isChatEnabled, setChatEnabled };
