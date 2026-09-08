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
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

module.exports = { load, save };
