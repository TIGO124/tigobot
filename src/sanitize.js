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
  return out.slice(0, 500);
}

module.exports = { sanitize };
