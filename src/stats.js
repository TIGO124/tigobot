// Ortak sistem istatistikleri (durum komutu + dashboard API birlikte kullanır).
function formatUptime(sn) {
  sn = Math.floor(sn || 0);
  const g = Math.floor(sn / 86400);
  const s = Math.floor((sn % 86400) / 3600);
  const d = Math.floor((sn % 3600) / 60);
  const k = sn % 60;
  const parca = [];
  if (g > 0) parca.push(`${g}g`);
  if (s > 0 || g > 0) parca.push(`${s}s`);
  if (d > 0 || s > 0 || g > 0) parca.push(`${d}d`);
  parca.push(`${k}sn`);
  return parca.join(' ');
}

function formatMem(bytes) {
  const mb = (bytes || 0) / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getStats(client) {
  const mem = process.memoryUsage();
  const guilds = client ? client.guilds.cache.size : 0;
  let users = 0;
  try {
    if (client) users = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
  } catch {}
  return {
    uptimeSec: Math.floor(process.uptime()),
    uptime: formatUptime(process.uptime()),
    memRss: formatMem(mem.rss),
    memHeap: formatMem(mem.heapUsed),
    memRssBytes: mem.rss,
    memHeapBytes: mem.heapUsed,
    guilds,
    users,
    commands: client && client.commands ? client.commands.size : 0,
    node: process.version,
    ping: client && client.ws ? Math.round(client.ws.ping) : -1,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

module.exports = { getStats, formatUptime, formatMem };
