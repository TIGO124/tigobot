module.exports = {
  // Otomatik silinecek kelimeler - kendine göre ekle/çıkar
  bannedWords: ['aq', 'amk', 'orospu', 'piç', 'siktir', 'yarrak'],
  // Link engelleme açık mı?
  blockInvites: true,
  inviteRegex: /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i,
  linkRegex: /(https?:\/\/[^\s]+)/i,
};
