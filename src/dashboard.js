// Basit web panel: sıfır bağımlılık (node:http).
// DASHBOARD_PORT tanımlıysa index.js'ten start(client) çağrılır.
// Okuma endpointleri açık; yazma (/api/local) DASHBOARD_TOKEN ister.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getStats } = require('./stats');
const { getLogs } = require('./logger');
const { load } = require('./store');
const { getLang } = require('./i18n');
const { queueDepth } = require('./ai');
const { acikMi, ayarla } = require('./local');
const { allModels } = require('./ai-models');

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
  if (!need) return false;
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams.get('token');
  const h = req.headers['x-dashboard-token'];
  return q === need || h === need;
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
        return json(res, 200, { ...getStats(client), queue: queueDepth() });
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return json(res, 200, configSummary(client));
      }
      if (req.method === 'GET' && url.pathname === '/api/logs') {
        const level = url.searchParams.get('level') || '';
        let logs = getLogs(url.searchParams.get('limit') || 120);
        if (level) logs = logs.filter(l => l.level === level);
        return json(res, 200, logs);
      }
      if (req.method === 'POST' && url.pathname === '/api/local') {
        if (!tokenOk(req)) return json(res, 403, { error: 'forbidden' });
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
  server.listen(port, () => console.log(`Panel açık: http://localhost:${port}`));
  return server;
}

module.exports = { start };
