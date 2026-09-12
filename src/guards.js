// Süreç güvenlik ağları: yakalanamayan hatalarda bot ÖLMESİN.
// Discord botlarında tek bir unutulmuş promise tüm süreci çökertebilir;
// bunlar loga düşer, süreç yaşamaya devam eder.
const { sanitize } = require('./sanitize');

let kurulu = false;
// Art arda patlayan süreç bozuk state'te ısrar etmemeli: 60 sn içinde
// 5 yakalanamayan hata olursa bilerek çıkılır ki Railway/pm2 yeniden başlatsın.
const HATA_PENCERE_MS = 60 * 1000;
const HATA_ESIK = 5;
let hataAnlari = [];
function sayHata() {
  const simdi = Date.now();
  hataAnlari = hataAnlari.filter(t => simdi - t < HATA_PENCERE_MS);
  hataAnlari.push(simdi);
  if (hataAnlari.length >= HATA_ESIK) {
    try { console.error(`ART ARDA HATA (${hataAnlari.length}/60sn): süreç bozuk olabilir, yeniden başlatma için çıkılıyor.`); } catch {}
    setTimeout(() => { try { process.exit(1); } catch {} }, 500);
  }
}
function installGuards() {
  if (kurulu) return;
  kurulu = true;
  process.on('unhandledRejection', (sebep) => {
    try {
      const msg = sebep instanceof Error ? (sebep.stack || sebep.message) : String(sebep);
      console.error('Yakalanamayan promise reddi (bot yaşıyor):', sanitize(msg).slice(0, 1000));
    } catch {}
    try { sayHata(); } catch {}
  });
  process.on('uncaughtException', (hata) => {
    try {
      const msg = hata instanceof Error ? (hata.stack || hata.message) : String(hata);
      console.error('Yakalanamayan istisna (bot yaşıyor):', sanitize(msg).slice(0, 1000));
    } catch {}
    try { sayHata(); } catch {}
  });
}

module.exports = { installGuards };
