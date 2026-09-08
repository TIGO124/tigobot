const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data');

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
