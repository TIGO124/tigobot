// Süreç güvenlik ağları: yakalanamayan hatalarda bot ÖLMESİN.
// Discord botlarında tek bir unutulmuş promise tüm süreci çökertebilir;
// bunlar loga düşer, süreç yaşamaya devam eder.
const { sanitize } = require('./sanitize');

let kurulu = false;
function installGuards() {
  if (kurulu) return;
  kurulu = true;
  process.on('unhandledRejection', (sebep) => {
    try {
      const msg = sebep instanceof Error ? (sebep.stack || sebep.message) : String(sebep);
      console.error('Yakalanamayan promise reddi (bot yaşıyor):', sanitize(msg).slice(0, 1000));
    } catch {}
  });
  process.on('uncaughtException', (hata) => {
    try {
      const msg = hata instanceof Error ? (hata.stack || hata.message) : String(hata);
      console.error('Yakalanamayan istisna (bot yaşıyor):', sanitize(msg).slice(0, 1000));
    } catch {}
  });
}

module.exports = { installGuards };
