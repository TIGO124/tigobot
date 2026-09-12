// Proje öz-denetimi: `npm run selftest` (deploy öncesi çalıştır).
// - Tüm komutlar iki dilde kuruluyor mu (isim/açıklama/execute)?
// - Tüm eventler sağlam mı (name/execute)?
// - Kritik modüller require edilebiliyor mu?
// - Kodda kullanılan t(lang,'anahtar') anahtarları i18n.js'te tanımlı mı?
// Hata varsa exitCode=1 (CI/Railway başarısızı görür).
const fs = require('fs');
const path = require('path');

let hata = 0;
const fail = (m) => { hata++; console.error('SELFTEST HATA: ' + m); };

// 1) Komutlar + Discord limitleri (isim ≤32, açıklama ≤100, seçenek ≤25)
const AD_RE = /^[\p{L}\p{N}_-]{1,32}$/u;
function limitDenele(j, etiket) {
  if (j.description && j.description.length > 100) fail(`${etiket}: açıklama 100 karakteri aşıyor (${j.description.length})`);
  for (const o of (j.options || [])) {
    const dallar = [o, ...((o.options || []))];
    for (const d of dallar) {
      if (d.description && d.description.length > 100) fail(`${etiket}/${d.name}: seçenek açıklaması 100+ (${d.description.length})`);
      if (d.choices && d.choices.length > 25) fail(`${etiket}/${d.name}: choices 25+ (${d.choices.length})`);
      if (d.name && !AD_RE.test(d.name)) fail(`${etiket}: geçersiz ad ${d.name}`);
    }
  }
}
const cmdDir = path.join(__dirname, 'commands');
for (const f of fs.readdirSync(cmdDir).filter(x => x.endsWith('.js'))) {
  try {
    const mod = require(path.join(cmdDir, f));
    if (!mod.build) { fail(f + ': build eksik'); continue; }
    for (const L of ['tr', 'en']) {
      try {
        const c = mod.build(L);
        const j = c.data.toJSON();
        if (!j || !j.name) fail(`${f}/${L}: isim yok`);
        if (j.name && !AD_RE.test(j.name)) fail(`${f}/${L}: geçersiz komut adı ${j.name}`);
        if (!c.execute) fail(`${f}/${L}: execute yok`);
        if (!j.description || j.description === j.name) fail(`${f}/${L}: açıklama eksik`);
        limitDenele(j, `${f}/${L}`);
      } catch (e) { fail(`${f}/${L}: ${e.message}`); }
    }
  } catch (e) { fail(f + ': ' + e.message); }
}

// 2) Eventler
const evtDir = path.join(__dirname, 'events');
for (const f of fs.readdirSync(evtDir).filter(x => x.endsWith('.js'))) {
  try {
    const evt = require(path.join(evtDir, f));
    if (!evt.name || !evt.execute) fail(f + ': name/execute eksik');
  } catch (e) { fail(f + ': ' + e.message); }
}

// 3) Kritik modüller
for (const m of ['store', 'i18n', 'ai', 'ai-models', 'ai-intent', 'ai-actions', 'ai-perms',
  'ai-progress', 'ai-yonetim', 'ai-image', 'memory', 'baglam', 'quota', 'sanitize',
  'owner', 'betatester', 'trust', 'guards', 'logger', 'schema', 'dashboard', 'sohbet',
  'counter', 'otocevap', 'arama', 'langdetect', 'local', 'buttons', 'diag', 'stats']) {
  try { require('./' + m); }
  catch (e) { fail(m + ': ' + e.message); }
}

// 4) i18n anahtar kapsama: kullanılan anahtar tanımlı mı?
try {
  const i18nSrc = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
  const kullanilan = new Set();
  const tara = (dosya) => {
    let src = '';
    try { src = fs.readFileSync(dosya, 'utf8'); } catch { return; }
    const re = /\bt\(\s*[A-Za-z_$][\w$]*\s*,\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(src))) kullanilan.add(m[1]);
  };
  const gez = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) gez(p);
      else if (f.name.endsWith('.js') && f.name !== 'i18n.js' && f.name !== 'selftest.js') tara(p);
    }
  };
  gez(__dirname);
  for (const k of kullanilan) {
    // Dinamik anahtarlar (`mg.op.${op}`) şablonla kurulur; öneki denetle.
    if (k.includes('${')) {
      const prefix = k.split('${')[0].replace(/['"`]$/, '');
      if (prefix && !i18nSrc.includes(`'${prefix}`)) fail(`i18n dinamik önek yok: ${k}`);
      continue;
    }
    if (!i18nSrc.includes(`'${k}':`)) fail(`i18n anahtar yok: ${k}`);
  }
} catch (e) { fail('i18n tarama: ' + e.message); }

// 5) Şema sürümü
try {
  const { CODE_VERSION, buildGuildCommands } = require('./schema');
  if (!Number.isInteger(CODE_VERSION) || CODE_VERSION < 1) fail('CODE_VERSION geçersiz');
  for (const L of ['tr', 'en']) {
    const arr = buildGuildCommands(L);
    if (!Array.isArray(arr) || !arr.length) fail(`şema ${L} boş`);
  }
} catch (e) { fail('schema: ' + e.message); }

// 6) KATALOG bütünlüğü: her op'un tr+en adı + risk + şema tutarlılığı
try {
  const { KATALOG } = require('./ai-actions');
  const { t } = require('./i18n');
  const keys = Object.keys(KATALOG);
  if (!keys.length) fail('KATALOG boş');
  for (const k of keys) {
    const g = KATALOG[k];
    if (!g.tool || !g.tool.parameters || typeof g.tool.parameters !== 'object') fail(`KATALOG ${k}: şema eksik`);
    if (g.risk !== 'dusuk' && g.risk !== 'yuksek') fail(`KATALOG ${k}: risk yok`);
    if (typeof g.run !== 'function') fail(`KATALOG ${k}: run yok`);
    if (t('tr', `mg.op.${k}`) === `mg.op.${k}`) fail(`KATALOG ${k}: TR ad yok`);
    if (t('en', `mg.op.${k}`) === `mg.op.${k}`) fail(`KATALOG ${k}: EN ad yok`);
    // Tool şeması: required alanlar properties'te tanımlı olmalı
    try {
      const p = g.tool.parameters;
      for (const r of (p.required || [])) {
        if (!p.properties || !p.properties[r]) fail(`KATALOG ${k}: required '${r}' tanımsız`);
      }
    } catch {}
    // Array şemalarında cap tutarlılığı (toplu işlemler sessiz budanmasın)
    try {
      for (const [ak, av] of Object.entries((g.tool.parameters.properties || {}))) {
        if (av && av.type === 'array' && !Number.isFinite(av.maxItems)) fail(`KATALOG ${k}.${ak}: maxItems yok`);
      }
    } catch {}
  }
} catch (e) { fail('KATALOG: ' + e.message); }

// 7) NLU kural regresyon (altın küme, ~240 vaka, senkron <1sn).
// Kaynak: temp harness (11.414 vaka) + tigobot-tr-nlu-regression skill.
// Kural motoru deterministiktir; bu küme gelecekteki fiil/tür/ebeveyn
// regresyonlarını (yanlış silme dahil) anında yakalar.
try {
  const { kuralNiyetler } = require('./ai-yonetim');
  const nnorm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}_]/gu, '');
  let nluHata = 0;
  const nluDene = (girdi, bekle) => {
    let alinan = null;
    try { alinan = kuralNiyetler(girdi, null); }
    catch (e) { nluHata++; fail(`nlu throw: ${girdi} (${e.message})`); return; }
    const ozet = JSON.stringify((alinan || []).map((o) => `${o.op}:${(o.args && (o.args.ad || o.args.ebeveyn)) || ''}`));
    if (bekle === 'bos') {
      if (!Array.isArray(alinan) || alinan.length !== 0) { nluHata++; fail(`nlu bos-degil: ${girdi} -> ${ozet}`); }
      return;
    }
    // bekle: [[op, adNorm], ...] (+opsiyonel {eb: parentNorm} son eleman özelliği)
    const got = (alinan || []).map((o) => [o.op, nnorm(o.args && o.args.ad), nnorm(o.args && o.args.ebeveyn)]);
    if (got.length !== bekle.length) { nluHata++; fail(`nlu sayi: ${girdi} beklenen=${bekle.length} alinan=${ozet}`); return; }
    for (let i = 0; i < bekle.length; i++) {
      const [eop, ead, eeb] = bekle[i];
      if (got[i][0] !== eop || got[i][1] !== ead || (eeb !== undefined && got[i][2] !== eeb)) {
        nluHata++; fail(`nlu uyusmazlik: ${girdi} beklenen=${JSON.stringify(bekle)} alinan=${ozet}`); return;
      }
    }
  };
  // 7a) Kritik altın vakalar (rapor cümlesi dahil)
  nluDene('tigobot senden sohbet1, sohbet2, sohbet, uyarılar1, uyarılar2 kanalını silip yeni bir AI grubu açmanı istiyorum, bu grubun içine AI1 ve aisohbet metin kanallarını ekle', 'bos');
  nluDene('eski1 ve eski2 kanallarını silip yeni bir OYUN grubu aç', 'bos');
  nluDene('GENEL grubunu sil ve onun yerine SOHBET grubunu aç', [['kategori_sil', 'genel'], ['kategori_ac', 'sohbet']]);
  nluDene('eski_duyuru kanalını sil ve onun yerine yeni_duyuru kanalını aç', [['kanal_sil', 'eski_duyuru'], ['kanal_ac', 'yeni_duyuru']]);
  nluDene('kurallar kanalını sil', [['kanal_sil', 'kurallar']]);
  nluDene('oyun_odasi grubunu sil', [['kategori_sil', 'oyun_odasi']]);
  nluDene('yemekler kanalını sil', [['kanal_sil', 'yemekler']]);
  nluDene('macera kanalını aç', [['kanal_ac', 'macera']]);
  nluDene('bekleme odası aç', [['kanal_ac', 'bekleme']]);
  nluDene('asil kanalını aç', [['kanal_ac', 'asil']]);
  nluDene('silgi kanalını aç', [['kanal_ac', 'silgi']]);
  nluDene('odak grubunu sil', [['kategori_sil', 'odak']]);
  nluDene('moda grubunu sil', [['kategori_sil', 'moda']]);
  nluDene('duyuru kanalını aç', [['kanal_ac', 'duyuru']]);
  nluDene('EGLENCE grubunu aç', [['kategori_ac', 'eglence']]);
  nluDene('EGLENCE grubunun altına AI1 ve AI2 kanallarını aç', [['kanal_ac', 'aı1', 'eglence'], ['kanal_ac', 'aı2', 'eglence']]);
  nluDene('yeni bir AI grubunun altına genel kanallarını aç', [['kanal_ac', 'genel', 'aı']]);
  nluDene('yonetim1 den yonetim5 e kadar kanal aç', [['kanal_ac', 'yonetim1'], ['kanal_ac', 'yonetim2'], ['kanal_ac', 'yonetim3'], ['kanal_ac', 'yonetim4'], ['kanal_ac', 'yonetim5']]);
  nluDene('sohbet kanalını silme lütfen', 'bos');
  nluDene('yeni kanal açmayı düşünüyorum', 'bos');
  nluDene('kaç kanal var', 'bos');
  nluDene('sayaç kur', 'bos');
  nluDene('anket aç', 'bos');
  nluDene('bana bilgi ver', 'bos');
  nluDene('"sohbet odası" kanalını aç', [['kanal_ac', 'sohbetodası']]);
  // 7b) Üretim matrisi (deterministik)
  const ADLAR = ['sohbet1', 'duyuru', 'kurallar', 'oyun_odasi', 'bilgi', 'müzik'];
  const SILF = ['sil', 'kapat', 'kaldır'];
  const ACF = ['aç', 'oluştur', 'kur'];
  for (const a of ADLAR) {
    for (const f of SILF) nluDene(`${a} kanalını ${f}`, [['kanal_sil', nnorm(a)]]);
    for (const f of SILF) nluDene(`${a} grubunu ${f}`, [['kategori_sil', nnorm(a)]]);
    for (const f of ACF) nluDene(`${a} kanalını ${f}`, [['kanal_ac', nnorm(a)]]);
    for (const f of ACF) nluDene(`${a} grubunu ${f}`, [['kategori_ac', nnorm(a)]]);
  }
  for (const a of ['kurallar', 'yemekler', 'bekleme']) nluDene(`${a} kanalını silip yeni bir X grubu aç`, 'bos');
  for (const p of ['EGLENCE', 'OYUN', 'AI']) {
    nluDene(`${p} grubuna AI1 kanallarını aç`, [['kanal_ac', nnorm('AI1'), nnorm(p)]]);
    nluDene(`yeni bir ${p} grubunun altına AI1 kanallarını aç`, [['kanal_ac', nnorm('AI1'), nnorm(p)]]);
  }
  if (nluHata) console.error(`SELFTEST NLU: ${nluHata} altın vaka tutmadı (üstte).`);
} catch (e) { fail('nlu regresyon: ' + e.message); }

if (hata) {
  console.error(`SELFTEST: ${hata} hata bulundu.`);
  process.exitCode = 1;
} else {
  console.log('SELFTEST: tamam.');
}
