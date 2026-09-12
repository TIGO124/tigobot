// Discord kanalına veya loga yazılan her metinden sırları temizler.
// Key asla kullanıcıya görünen hiçbir mesaja düşmemeli.
function sanitize(text) {
  if (text === null || text === undefined) return '';
  let out = String(text);
  // NVIDIA API keyleri
  out = out.replace(/nvapi-[A-Za-z0-9_\-]+/g, '[gizli-nvidia-key]');
  // Discord bot tokenleri (xxx.yyy.zzz)
  out = out.replace(/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, '[gizli-discord-token]');
  // "api_key = ..." tarzı sızıntılar
  out = out.replace(/(api[_-]?key\s*[:=]\s*)['"]?[^\s'"]+/gi, '$1[gizli]');
  // Bearer başlığı yansımaları
  out = out.replace(/(bearer\s+)[A-Za-z0-9_\-.~+/=]+/gi, '$1[gizli]');
  // OpenAI / genel API anahtarları
  out = out.replace(/\bsk-[A-Za-z0-9_\-]{10,}/g, '[gizli-api-key]');
  // Slack tokenleri
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]+/g, '[gizli-slack-token]');
  // GitHub tokenleri
  out = out.replace(/\b(ghp|ghu|gho|ghr|github_pat)_[A-Za-z0-9_]+/g, '[gizli-github-token]');
  // AWS erişim anahtarı
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[gizli-aws-key]');
  // Discord webhook URL'leri (mesaj basabilir)
  out = out.replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/gi, '[gizli-webhook]');
  // PEM özel anahtar blokları
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[gizli-private-key]');
  // Bağlantı cümleciğindeki kimlik bilgileri (mongodb+srv://user:pass@host)
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/[^/\s]*?)(:[^/\s@]+)?@/gi, '$1:***@');
  // Genel "password/secret/token = ..." atamaları
  out = out.replace(/((?:passw(?:or)?d|secret|token)\s*[:=]\s*)['"]?[^\s'"]+/gi, '$1[gizli]');
  return out.slice(0, 500);
}

const { t } = require('./i18n');

// Hatayı kullanıcıya gösterilecek genel mesaja çevirir (istenen dilde).
// Teknik detay kanala gitmez, Railway loguna düşer (sahip oradan görür).
function kullaniciMesaji(e, lang) {
  const L = lang === 'en' ? 'en' : 'tr';
  const ham = sanitize(e && e.message ? e.message : String(e));
  if (ham) console.error('İç hata (sadece logda):', ham);
  if (/NVIDIA_API_KEY/i.test(ham)) return t(L, 'err.ai.unavailable');
  if (/hatası \((5|429)/.test(ham) || /timeout|zaman aşımı/i.test(ham)) {
    return t(L, 'err.ai.busy');
  }
  if (/hatası \(4/i.test(ham)) return t(L, 'err.ai.bad');
  if (/boş cevap/i.test(ham)) return t(L, 'err.ai.empty');
  return t(L, 'err.generic');
}

// Kullanıcı girdisini Discord limitlerine sığdır (uzunsa … ile keser).
function clip(s, max = 1000) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

module.exports = { sanitize, kullaniciMesaji, clip };
