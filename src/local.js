const { load, save } = require('./store');

// Yerel AI anahtarı (global, tüm sunucularda geçerli).
// Kapalıysa yerel modeller denenmez, direkt nvidia kullanılır.
function acikMi() {
  const data = load('local.json', {});
  return data.acik !== false;
}

function ayarla(acik) {
  save('local.json', { acik: Boolean(acik) });
  return acikMi();
}

module.exports = { acikMi, ayarla };
