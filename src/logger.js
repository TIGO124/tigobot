// Hafif halka log tamponu: dashboard /api/logs buradan okur.
// install() console.log/error/warn'u sarar, orijinal davranışı korur.
const MAX = 300;
const buf = [];

function push(level, msg) {
  buf.push({ t: new Date().toISOString(), level, msg: String(msg).slice(0, 2000) });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

function getLogs(limit = 100) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 100, 1), MAX);
  return buf.slice(-n);
}

let kurulu = false;
function install() {
  if (kurulu) return;
  kurulu = true;
  for (const m of ['log', 'warn', 'error']) {
    const orig = console[m].bind(console);
    console[m] = (...a) => {
      try {
        const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
        push(m === 'log' ? 'info' : m, s);
      } catch {}
      orig(...a);
    };
  }
}

module.exports = { push, getLogs, install };
