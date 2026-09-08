// Hafif dil algılama: sadece 'tr' / 'en' / null.
// Türkçe'ye özgü harf varsa anında 'tr'. Yoksa kelime skorlaması.
const TR_HARF = /[ğĞşŞıİçÇöÖüÜ]/;

const TR_KELIME = new Set(('ve bir bu su o da de ki mi mı mu mü ne nasıl naber merhaba selam nedir değildir için gibi kadar çok daha en ben sen biz siz onlar benim senin ile ama fakat çünkü eğer sonra önce şimdi burada orada nasılsın iyiyim sağol teşekkürler lütfen evet hayır değil var yok kim nerede neden nasıl kaç hangi şey kişi zaman gün bugün yarın dün iyi kötü güzel büyük küçük yeni eski yapmak olmak gitmek gelmek demek bilmek istemek ederim ediyor musun mısın ini ının olduğun benimle seninle her çoktan beri herkes kimse şeyler bunlar şunlar onlar sayesinde karşı rağmen başka yerde yine yine de hem yoksa ise iken dır dir dur dür tır tir tur tür').split(/\s+/).filter(Boolean));
const EN_KELIME = new Set(('the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us hello hi hey thanks thank please yes no are is was were will would could should do does did has have had what when where why which who how many are you your youre im dont cant wont thats hello there here this that these those then them they than that with from your about into over after').split(/\s+/).filter(Boolean));

function detectLang(text) {
  if (!text || typeof text !== 'string') return null;
  if (TR_HARF.test(text)) return 'tr';
  const kelimeler = text.toLocaleLowerCase('tr').split(/[^\p{L}]+/u).filter(w => w.length > 1);
  if (!kelimeler.length) return null;
  let tr = 0, en = 0;
  for (const w of kelimeler) {
    if (TR_KELIME.has(w)) tr++;
    if (EN_KELIME.has(w)) en++;
  }
  if (tr > 0 && en === 0) return 'tr';
  if (en > 0 && tr === 0) return 'en';
  if (tr === 0 && en === 0) return null;
  if (Math.abs(tr - en) < 2) return null;
  return tr > en ? 'tr' : 'en';
}

module.exports = { detectLang };
