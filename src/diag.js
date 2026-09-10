// NVIDIA bağlantı teşhisi: DNS -> TCP -> TLS/HTTPS -> auth, kademeli ve hızlı.
// Her adım kısa zaman aşımıyla denenir; nerede takıldığı net raporlanır.
// Sır İÇERMEZ (key'in sadece varlığı/uzunluğu raporlanır).
const dns = require('dns').promises;
const net = require('net');

const ADIM_MS = 8000;

function temizKey() {
  return (process.env.NVIDIA_API_KEY || '').trim();
}

async function sureli(promise, ms, ad) {
  let timer;
  const yarıs = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(ad + '-zaman-asimi')), ms); });
  try {
    const t0 = Date.now();
    const sonuc = await Promise.race([promise, yarıs]);
    return { ok: true, ms: Date.now() - t0, ...sonuc };
  } catch (e) {
    return { ok: false, hata: String((e && e.message) || e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHost(host, { authPath = null } = {}) {
  const out = { host };
  // 1. DNS
  out.dns = await sureli(
    dns.lookup(host).then(a => ({ adres: a.address })),
    ADIM_MS, 'dns'
  );
  if (!out.dns.ok) return out;
  // 2. TCP 443
  out.tcp = await sureli(new Promise((resolve, reject) => {
    const s = net.connect(443, host);
    s.setTimeout(ADIM_MS);
    s.on('connect', () => { s.destroy(); resolve({}); });
    s.on('timeout', () => { s.destroy(); reject(new Error('tcp-zaman-asimi')); });
    s.on('error', reject);
  }), ADIM_MS + 1000, 'tcp');
  if (!out.tcp.ok) return out;
  // 3. HTTPS GET /
  out.https = await sureli(
    (async () => {
      const res = await fetch(`https://${host}/`, { method: 'GET', signal: AbortSignal.timeout(ADIM_MS) });
      await res.arrayBuffer().catch(() => {});
      return { status: res.status };
    })(),
    ADIM_MS + 2000, 'https'
  );
  if (!out.https.ok) return out;
  // 4. Auth (sadece integrate: /v1/models)
  if (authPath) {
    const key = temizKey();
    if (!key) {
      out.auth = { ok: false, hata: 'NVIDIA_API_KEY-yok' };
      return out;
    }
    out.auth = await sureli(
      (async () => {
        const res = await fetch(`https://${host}${authPath}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(ADIM_MS),
        });
        const txt = await res.text().catch(() => '');
        let adet = null;
        try { const j = JSON.parse(txt); if (Array.isArray(j.data)) adet = j.data.length; } catch {}
        return { status: res.status, modelSayisi: adet, govde: txt.slice(0, 160) };
      })(),
      ADIM_MS + 2000, 'auth'
    );
    out.keyUzunluk = key.length;
  }
  return out;
}

async function runDiag() {
  const [integrate, genai] = await Promise.all([
    checkHost('integrate.api.nvidia.com', { authPath: '/v1/models' }),
    checkHost('ai.api.nvidia.com'),
  ]);
  // Yerel tünel (sahibin PC'sindeki Ollama): AI_BASE_URL yoksa kurulmamış demektir.
  let yerel;
  const base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    yerel = { ayarlı: false, hata: 'AI_BASE_URL-yok' };
  } else {
    let host = null;
    try { host = new URL(base).hostname; } catch { host = null; }
    if (!host) {
      yerel = { ayarlı: false, hata: 'AI_BASE_URL-hatalı' };
    } else {
      const h = await checkHost(host);
      // Ollama /api/tags'e bak: model listesi dönerse tünel + servis sağlam.
      let tags = null;
      if (h.https && h.https.ok) {
        tags = await sureli(
          (async () => {
            const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(ADIM_MS) });
            const j = await res.json().catch(() => ({}));
            return { status: res.status, modelSayisi: Array.isArray(j.models) ? j.models.length : null };
          })(),
          ADIM_MS + 2000, 'tags'
        );
      }
      yerel = { ayarlı: true, adres: host, ...h, tags };
    }
  }
  return { zaman: new Date().toISOString(), integrate, genai, yerel };
}

// Discord/panel için tek satırlık özet
function ozetle(adim) {
  if (!adim) return '—';
  if (adim.ok) return `OK${adim.ms !== undefined ? ` (${adim.ms}ms)` : ''}${adim.status !== undefined ? ` [${adim.status}]` : ''}`;
  return 'HATA: ' + (adim.hata || '?');
}

module.exports = { runDiag, checkHost, ozetle, temizKey, ADIM_MS };
