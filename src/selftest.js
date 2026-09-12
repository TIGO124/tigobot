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

if (hata) {
  console.error(`SELFTEST: ${hata} hata bulundu.`);
  process.exitCode = 1;
} else {
  console.log('SELFTEST: tamam.');
}
