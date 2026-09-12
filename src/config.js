const bannedWords = ['aq', 'amk', 'orospu', 'piç', 'siktir', 'yarrak'];

function escRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Yasaklı kelime kontrolü: kısa tokenler (aq, amk...) kelime sınırıyla aranır,
// yoksa "aquarium", "Iraq", "saqol" gibi masum mesajlar da silinirdi (substring hatası).
// Uzun kelimeler çekimleri yakalasın diye substring kalır.
function containsBanned(text) {
  const ham = String(text || '');
  const kucuk = ham.toLocaleLowerCase('tr');
  return bannedWords.some(w => {
    const k = String(w || '').toLocaleLowerCase('tr');
    if (!k) return false;
    if (k.length <= 3) {
      try {
        return new RegExp(`(?<![\\p{L}\\p{N}_])${escRegex(k)}(?![\\p{L}\\p{N}_])`, 'iu').test(ham);
      } catch {
        return kucuk.split(/[^a-zçğıöşü0-9_]+/u).includes(k);
      }
    }
    return kucuk.includes(k);
  });
}

module.exports = {
  // Otomatik silinecek kelimeler - kendine göre ekle/çıkar
  bannedWords,
  containsBanned,
  // Link engelleme açık mı?
  blockInvites: true,
  inviteRegex: /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i,
  linkRegex: /(https?:\/\/[^\s]+)/i,
};
