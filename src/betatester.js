// Beta-tester listesi: sahip dışında botu kullanabilecek kişiler.
// Liste globaldir (tüm sunucularda geçerli), betatesters.json içinde saklanır.
const { load, save } = require('./store');

const DOSYA = 'betatesters.json';

function liste() {
  const arr = load(DOSYA, []);
  return Array.isArray(arr) ? arr : [];
}

function testMi(userId) {
  if (!userId) return false;
  return liste().includes(userId);
}

function ekle(userId) {
  if (!userId) return false;
  const arr = liste();
  if (arr.includes(userId)) return false;
  arr.push(userId);
  save(DOSYA, arr);
  return true;
}

function kaldir(userId) {
  const arr = liste();
  const idx = arr.indexOf(userId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  save(DOSYA, arr);
  return true;
}

module.exports = { liste, testMi, ekle, kaldir };
