const { load, save } = require('./store');

// Yerel modeller PC'deki Ollama üzerinden çalışır (AI_BASE_URL).
// Ollama'daki model adların farklıysa Railway'de AI_MODEL_4B / AI_MODEL_9B ile ezebilirsin.
function allModels() {
  return [
    { key: 'qwen35-4b', name: 'Qwen3.5-4B (yerel)', kind: 'local', model: process.env.AI_MODEL_4B || 'Qwen3.5-4B' },
    { key: 'qwen35-9b', name: 'Qwen3.5-9B (yerel)', kind: 'local', model: process.env.AI_MODEL_9B || 'Qwen3.5-9B' },
    { key: 'nvidia-gpt-oss', name: 'nvidia GPT-OSS-20B', kind: 'nvidia', model: 'openai/gpt-oss-20b' },
    { key: 'nvidia-mistral-nemotron', name: 'nvidia Mistral-Nemotron', kind: 'nvidia', model: 'mistralai/mistral-nemotron' },
    { key: 'nvidia-llama-vision', name: 'nvidia Llama-3.2-11B', kind: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' },
    { key: 'nvidia-lightning', name: 'nvidia Nemotron-Lightning-30B', kind: 'nvidia', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  ];
}

function findModel(key) {
  return allModels().find(m => m.key === key) || allModels()[0];
}

function getGuildModel(guildId) {
  const map = load('aimodel.json', {});
  return findModel(map[guildId]);
}

function setGuildModel(guildId, key) {
  const map = load('aimodel.json', {});
  map[guildId] = key;
  save('aimodel.json', map);
  return findModel(key);
}

// Yerel servis kapalıyken cevap verecek yedek: listedeki ilk nvidia modeli
function defaultNvidia() {
  return allModels().find(m => m.kind === 'nvidia') || allModels()[0];
}

module.exports = { allModels, findModel, getGuildModel, setGuildModel, defaultNvidia };
