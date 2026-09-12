// İnternet araması (Tavily): güncel bilgi gerektiren sorularda modele
// taze bağlam verilir. Hem yerel hem NVIDIA yolunda çalışır.
// TAVILY_API_KEY yoksa arama adımı sessizce atlanır (bot aramasız çalışır).
const { clip } = require('./sanitize');

const TAVILY_URL = 'https://api.tavily.com/search';
const ARAMA_ZAMAN_ASIMI = 15000;
const MAX_SORGU = 300;

function tavilyKey() {
  return (process.env.TAVILY_API_KEY || '').trim();
}

function aramaAcikMi() {
  return Boolean(tavilyKey());
}

// Soru güncel bilgi istiyor mu? Ucuz kelime filtresi (model çağrısı yok,
// kuyrukta beklemez). "ara:" öneki aramayı zorlar.
const ARAMA_DESEN = [
  /^\s*ara\s*:/i, /^\s*search\s*:/i, /^\s*internette\s+(ara|bak|bul)/i,
  /güncel/i, /bugün/i, /son\s*dakika/i, /son\s*gelişme/i, /şu\s*an\s*(ne|kaç|kim|nerede)/i,
  /fiyat|kaç\s*(tl|dolar|euro|lira)|ne\s*kadar/i, /hava\s*(durumu|nasıl|kaç\s*derece)/i,
  /kim\s*kazandı|maç\s*(sonucu|skoru)|skor/i, /dolar|euro|altın|bitcoin|borsa/i,
  /vizyonda|sinemada|yeni\s*çıkan/i,
  // NOT: çıplak yıl (2025) tek başına aramayı tetiklemez ("2025'te doğdum" boşa arardı).
  /current|latest|today'?s|right\s*now/i, /\bnews\b/i, /who\s*won|score/i,
  /price|how\s*much|stock\s*price/i, /weather/i,
];

function aramaGerekirMi(soru) {
  const s = String(soru || '');
  if (!s.trim()) return false;
  return ARAMA_DESEN.some(re => re.test(s));
}

function sorguTemizle(soru) {
  return clip(String(soru || '').replace(/^\s*(ara|search)\s*:\s*/i, '').trim(), MAX_SORGU);
}

// Tavily'de arar, modele verilecek kompakt metni döner (bulunamazsa null).
// Hata fırlatır (401/429/ağ); çağıran aramasız devam eder.
async function webAra(soru, { sonuc = 5 } = {}) {
  const key = tavilyKey();
  if (!key) return null;
  const query = sorguTemizle(soru);
  if (!query) return null;
  // AbortController+setTimeout: sinyal bekleme bitene kadar kökten
  // erişilebilir tutulur (inline AbortSignal.timeout GC riski taşır).
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ARAMA_ZAMAN_ASIMI);
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: Math.min(Math.max(sonuc, 1), 8),
        include_answer: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const govde = await res.text().catch(() => '');
      throw new Error(`Arama hatası (${res.status}): ${govde.slice(0, 120)}`);
    }
    const data = await res.json().catch(() => ({}));
    return sonucMetni(data, query, sonuc);
  } finally {
    clearTimeout(timer);
  }
}

function sonucMetni(data, query, sonuc) {
  const satirlar = [];
  if (data && data.answer) satirlar.push(`Özet: ${clip(String(data.answer), 600)}`);
  const ogeler = data && Array.isArray(data.results) ? data.results.slice(0, sonuc) : [];
  for (const o of ogeler) {
    const baslik = clip(String((o && o.title) || ''), 120);
    const parca = clip(String((o && o.content) || ''), 400);
    if (baslik || parca) satirlar.push(`- ${baslik}${parca ? ': ' + parca : ''}`);
  }
  if (!satirlar.length) return null;
  const tarih = new Date().toISOString().slice(0, 10);
  return `İnternet notları (${tarih}, "${clip(query, 80)}" araması):\n${satirlar.join('\n')}\nBunları kullan, uydurma; emin olmadığında kaynağa dayandığını belirt.`;
}

module.exports = { aramaAcikMi, aramaGerekirMi, sorguTemizle, webAra };
