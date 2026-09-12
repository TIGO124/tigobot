// Beta-tester listesi: sahip dışında botu kullanabilecek kişiler.
// Liste globaldir (tüm sunucularda geçerli), betatesters.json içinde saklanır.
const { load, save } = require('./store');

const DOSYA = 'betatesters.json';

function liste() {
  const arr = load(DOSYA, []);
  if (!Array.isArray(arr)) return [];
  // Bozuk girdileri ayıkla (elle bozulmuş dosya listeyi kirletmesin)
  return arr.filter(id => typeof id === 'string' && /^\d{10,}$/.test(id));
}

function gecerliId(userId) {
  return typeof userId === 'string' && /^\d{10,}$/.test(userId);
}

function testMi(userId) {
  if (!gecerliId(userId)) return false;
  return liste().includes(userId);
}

function ekle(userId) {
  if (!gecerliId(userId)) return false;
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
