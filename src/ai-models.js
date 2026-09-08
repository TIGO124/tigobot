const { load, save } = require('./store');

// Yerel modeller PC'deki Ollama üzerinden çalışır (AI_BASE_URL).
// Ollama'daki model adların farklıysa Railway'de AI_MODEL_4B / AI_MODEL_9B ile ezebilirsin.
function allModels() {
  return [
    { key: 'qwen35-4b', name: { tr: 'Qwen3.5-4B (yerel)', en: 'Qwen3.5-4B (local)' }, kind: 'local', model: process.env.AI_MODEL_4B || 'qwen3.5:4b' },
    { key: 'qwen35-9b', name: { tr: 'Qwen3.5-9B (yerel)', en: 'Qwen3.5-9B (local)' }, kind: 'local', model: process.env.AI_MODEL_9B || 'qwen3.5:9b' },
    { key: 'nvidia-gpt-oss', name: { tr: 'nvidia GPT-OSS-20B', en: 'nvidia GPT-OSS-20B' }, kind: 'nvidia', model: 'openai/gpt-oss-20b' },
    { key: 'nvidia-mistral-nemotron', name: { tr: 'nvidia Mistral-Nemotron', en: 'nvidia Mistral-Nemotron' }, kind: 'nvidia', model: 'mistralai/mistral-nemotron' },
    { key: 'nvidia-llama-vision', name: { tr: 'nvidia Llama-3.2-11B', en: 'nvidia Llama-3.2-11B' }, kind: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' },
    { key: 'nvidia-lightning', name: { tr: 'nvidia Nemotron-Lightning-30B', en: 'nvidia Nemotron-Lightning-30B' }, kind: 'nvidia', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  ];
}

function modelName(m, lang) {
  if (!m) return '';
  if (typeof m.name === 'string') return m.name;
  return (m.name && (m.name[lang] || m.name.tr)) || m.key;
}

function kindLabel(m, lang) {
  if (lang === 'en') return m.kind === 'local' ? 'your computer' : 'NVIDIA cloud';
  return m.kind === 'local' ? 'senin bilgisayarın' : 'NVIDIA bulutu';
}

function findModel(key) {
  return allModels().find(m => m.key === key) || null;
}

function defaultModel() {
  return allModels()[0];
}

function getUserModel(userId) {
  const map = load('aimodel.json', {});
  return findModel(map[userId]) || defaultModel();
}

// Sadece geçerli anahtar kaydedilir; geçersizse null döner (hayalet kayıt yok)
function setUserModel(userId, key) {
  const m = findModel(key);
  if (!m) return null;
  const map = load('aimodel.json', {});
  map[userId] = m.key;
  save('aimodel.json', map);
  return m;
}

// Yerel servis kapalıyken cevap verecek yedek: listedeki ilk nvidia modeli
function defaultNvidia() {
  return allModels().find(m => m.kind === 'nvidia') || allModels()[0];
}

module.exports = { allModels, findModel, getUserModel, setUserModel, defaultModel, defaultNvidia, modelName, kindLabel };
