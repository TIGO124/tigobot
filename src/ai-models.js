const { load, save } = require('./store');

// Yerel modeller PC'deki Ollama üzerinden çalışır (AI_BASE_URL).
// Ollama'daki model adların farklıysa Railway'de AI_MODEL_4B / AI_MODEL_9B ile ezebilirsin.
function allModels() {
  return [
    { key: 'qwen35-4b', name: 'Qwen3.5-4B (yerel)', kind: 'local', model: process.env.AI_MODEL_4B || 'Qwen3.5-4B' },
    { key: 'qwen35-9b', name: 'Qwen3.5-9B (yerel)', kind: 'local', model: process.env.AI_MODEL_9B || 'Qwen3.5-9B' },
    { key: 'nvidia-nemotron-70b', name: 'nvidia Nemotron-70B', kind: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    { key: 'nvidia-llama33-70b', name: 'nvidia Llama-3.3-70B', kind: 'nvidia', model: 'meta/llama-3.3-70b-instruct' },
    { key: 'nvidia-deepseek-r1', name: 'nvidia DeepSeek-R1', kind: 'nvidia', model: 'deepseek-ai/deepseek-r1' },
    { key: 'nvidia-qwen-coder', name: 'nvidia Qwen2.5-Coder-32B', kind: 'nvidia', model: 'qwen/qwen2.5-coder-32b-instruct' },
    { key: 'nvidia-mixtral', name: 'nvidia Mixtral-8x22B', kind: 'nvidia', model: 'mistralai/mixtral-8x22b-instruct-v0.1' },
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

module.exports = { allModels, findModel, getGuildModel, setGuildModel };
