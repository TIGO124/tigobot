// Basit web panel: sıfır bağımlılık (node:http).
// DASHBOARD_PORT (yoksa PORT) tanımlıysa index.js'ten start(client) çağrılır.
// DASHBOARD_TOKEN tanımlıysa TÜM /api/* endpointleri token ister (header
// x-dashboard-token veya ?token=). Tanımlı değilse panel korumasız açılır
// (sadece local test için) ve açılışta uyarı basılır.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getStats } = require('./stats');
const { getLogs } = require('./logger');
const { runDiag } = require('./diag');
const { load } = require('./store');
const { getLang } = require('./i18n');
const { queueDepth } = require('./ai');
const { imgQueueDepth } = require('./ai-image');
const { acikMi, ayarla } = require('./local');
const { allModels, isChatEnabled, setChatEnabled, getGlobalModel, setGlobalModel, getGuildModelKey, setGuildModel, effectiveModel } = require('./ai-models');
const { IMG_MODELS, isImgEnabled, setImgEnabled, getGlobalImgModel, setGlobalImgModel, getGuildImgModelKey, setGuildImgModel, effectiveImgModel } = require('./ai-image');

function guildList(client) {
  const out = [];
  try {
    for (const g of client.guilds.cache.values()) {
      out.push({ id: g.id, name: g.name, members: g.memberCount || 0, lang: getLang(g.id) });
    }
  } catch {}
  return out.sort((a, b) => b.members - a.members);
}

function configSummary(client) {
  const lang = load('lang.json', {});
  const trust = load('trust.json', {});
  const counter = load('counter.json', {});
  const history = load('aihistory.json', {});
  const polls = load('ankets.json', {});
  return {
    local: acikMi(),
    nvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
    langCount: Object.keys(lang).length,
    trustCount: Object.keys(trust).length,
    counterCount: Object.keys(counter).length,
    historyCount: Object.keys(history).length,
    pollCount: Object.keys(polls).length,
    modelCount: allModels().length,
    guilds: guildList(client),
  };
}

function tokenOk(req) {
  const need = process.env.DASHBOARD_TOKEN;
  if (!need) return true; // korumasız mod (sadece localhost'ta risk düşük)
  // Sadece header kabul edilir: ?token= geçmişe/loga düşmesin.
  const h = req.headers['x-dashboard-token'];
  return !!h && h === need;
}

function isOnline(client) {
  try {
    if (client && typeof client.isReady === 'function') return client.isReady();
  } catch {}
  return false;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function start(client) {
  // Railway PORT değişkenine düşer (public domain o porta bağlanır).
  const port = parseInt(process.env.DASHBOARD_PORT || process.env.PORT, 10);
  if (!port) return null;
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/api/stats') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        return json(res, 200, { ...getStats(client), queue: queueDepth(), imgQueue: imgQueueDepth(), online: isOnline(client) });
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        return json(res, 200, configSummary(client));
      }
      if (req.method === 'GET' && url.pathname === '/api/logs') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        const level = url.searchParams.get('level') || '';
        let logs = getLogs(url.searchParams.get('limit') || 120);
        if (level) logs = logs.filter(l => l.level === level);
        return json(res, 200, logs);
      }
      if (req.method === 'GET' && url.pathname === '/api/models') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        return json(res, 200, {
          globalChat: getGlobalModel().key,
          globalImg: getGlobalImgModel().key,
          chat: allModels().map(m => ({
            key: m.key, name: (m.name && m.name.tr) || m.key, kind: m.kind,
            api: m.model, enabled: isChatEnabled(m.key),
          })),
          img: IMG_MODELS.map(m => ({
            key: m.key, name: (m.name && m.name.tr) || m.id,
            api: m.id, enabled: isImgEnabled(m.key),
          })),
          guilds: guildList(client).map(g => ({
            ...g, model: getGuildModelKey(g.id), effective: effectiveModel(g.id).key,
            imgModel: getGuildImgModelKey(g.id), imgEffective: effectiveImgModel(g.id).key,
          })),
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/models') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const { type, key, enabled, guildId } = JSON.parse(body || '{}');
            if (type === 'img') {
              if (!setImgEnabled(key, enabled === true)) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { key, enabled: enabled === true });
            }
            if (type === 'globalImg') {
              const m = setGlobalImgModel(key);
              if (!m) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { key: m.key });
            }
            if (type === 'globalChat') {
              const m = setGlobalModel(key);
              if (!m) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { key: m.key });
            }
            if (type === 'guildChat') {
              if (!guildId) return json(res, 400, { error: 'guildId gerekli' });
              const m = setGuildModel(guildId, key === null ? null : key);
              if (key !== null && !m) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { guildId, key: key === null ? null : m.key });
            }
            if (type === 'guildImg') {
              if (!guildId) return json(res, 400, { error: 'guildId gerekli' });
              const m = setGuildImgModel(guildId, key === null ? null : key);
              if (key !== null && !m) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { guildId, key: key === null ? null : m.key });
            }
            if (type === 'chat') {
              if (!setChatEnabled(key, enabled === true)) return json(res, 400, { error: 'bilinmeyen model' });
              return json(res, 200, { key, enabled: enabled === true });
            }
            json(res, 400, { error: 'bilinmeyen istek' });
          } catch {
            json(res, 400, { error: 'bad json' });
          }
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/diag') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        runDiag().then(
          d => json(res, 200, d),
          () => json(res, 500, { error: 'diag failed' })
        );
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/power') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', async () => {
          try {
            const action = (JSON.parse(body || '{}').action || '').toLowerCase();
            if (action === 'stop') {
              if (!isOnline(client)) return json(res, 200, { online: false, msg: 'zaten çevrimdışı' });
              await client.destroy();
              console.log('Panel: bot durduruldu.');
              return json(res, 200, { online: false });
            }
            if (action === 'start') {
              if (isOnline(client)) return json(res, 200, { online: true, msg: 'zaten çevrimiçi' });
              if (!process.env.TOKEN) return json(res, 500, { error: 'TOKEN eksik' });
              await client.login(process.env.TOKEN);
              console.log('Panel: bot başlatıldı.');
              return json(res, 200, { online: true });
            }
            if (action === 'restart') {
              json(res, 200, { restarting: true });
              console.log('Panel: yeniden başlatılıyor...');
              setTimeout(() => process.exit(0), 600); // Railway container'ı yeniden başlatır
              return;
            }
            json(res, 400, { error: 'action: stop/start/restart gerekli' });
          } catch (e) {
            json(res, 500, { error: 'güç işlemi başarısız' });
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/local') {
        if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const on = JSON.parse(body || '{}').on;
            if (on === true) ayarla(true);
            else if (on === false) ayarla(false);
            else return json(res, 400, { error: 'on:true/false gerekli' });
            json(res, 200, { local: acikMi() });
          } catch {
            json(res, 400, { error: 'bad json' });
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      json(res, 500, { error: 'internal' });
    }
  });
  // Panel varsayılan olarak SADECE yerel makineye (127.0.0.1) bağlanır:
  // public domain / dış ağ erişimi kapalıdır. Erişim için:
  //  - Yerelde: http://localhost:PORT
  //  - Railway'de: `railway connect` (port forward) ile yerel tünel.
  // Dışarıya açmak İSTENMİYORSA DASHBOARD_HOST değişkenini 0.0.0.0 yapma.
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  server.listen(port, host, () => {
    const erisim = host === '127.0.0.1' ? 'sadece-yerel' : 'dışa-açık';
    console.log(`Panel açık: http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (${erisim})`);
  });
  if (!process.env.DASHBOARD_TOKEN) {
    console.log('UYARI: DASHBOARD_TOKEN yok, panel korumasız! Railway Variables kısmına ekle.');
  }
  return server;
}

module.exports = { start };
