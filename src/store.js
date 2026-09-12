const fs = require('fs');
const path = require('path');

const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
const kalici = Boolean(process.env.DATA_DIR);

try {
  fs.mkdirSync(dir, { recursive: true });
} catch {}

console.log(`Veri dizini: ${dir}${kalici ? ' (kalıcı)' : ' (geçici - güncelleme sıfırlar)'}`);

function load(file, fallback) {
  try {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function save(file, data) {
  fs.mkdirSync(dir, { recursive: true });
  // Atomik yazım: önce geçici dosyaya, sonra rename.
  // Süreç yazım ortasında ölürse JSON yarım kalmaz (bozuk dosya -> veri kaybı olurdu).
  const p = path.join(dir, file);
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

module.exports = { load, save };
