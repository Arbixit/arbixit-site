// Pusslets datakedja: dashboarden -> data/apps.json -> index.html
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publikaAppar, sajtAppar, byggIndex, lasEditorial, lasData, MAX_BITAR } from '../scripts/build-apps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lf = (s) => s.replace(/\r\n/g, '\n');
const sajt = lf(readFileSync(join(root, 'index.html'), 'utf8'));

test('pusslet: index.html är byggd ur data/apps.json (kör node scripts/build-apps.mjs)', () => {
  const sajtappar = sajtAppar(lasData().apps, lasEditorial());
  assert.equal(lf(byggIndex(sajt, sajtappar)), sajt, 'index.html är inte i synk med data/apps.json');
  assert.ok(!/const ICONS\s*=/.test(sajt), 'hårdkodad ikonkarta ska inte finnas kvar');
  assert.ok(sajt.includes('<noscript>'), 'noscript-fallback saknas');
});

test('pusslet: prod-appar har https-länk, appar på väg har ingen', () => {
  const { apps } = lasData();
  assert.ok(apps.length > 0 && apps.length <= MAX_BITAR);
  for (const a of apps) {
    if (a.status === 'prod') {
      assert.match(a.url, /^https:\/\//, `${a.name}: prod utan https-länk`);
    } else {
      assert.equal(a.status, 'stage');
      assert.equal(a.url, undefined, `${a.name}: stage-adresser publiceras inte`);
    }
  }
  for (const a of sajtAppar(apps, lasEditorial())) {
    if (a.icon) assert.ok(existsSync(join(root, a.icon)), `saknar ${a.icon}`);
    for (const sprak of ['sv', 'en']) {
      assert.ok(a.tag[sprak] && a.blurb[sprak] && Array.isArray(a.features[sprak]), `${a.name}: text saknas (${sprak})`);
    }
  }
});

test('pusslet: inga stage-adresser i startsidan', () => {
  assert.ok(!/https?:\/\/stage\./.test(sajt), 'stage-adress i index.html');
});

test('pusslet: urvalsreglerna för vad som får synas publikt', () => {
  const ed = { kand: { id: 'kand' }, dold: { id: 'dold', public: false }, kundbox: { id: 'kundbox' } };
  const kalla = [
    { name: 'stage-okand', status: 'stage', platform: 'platform1', link: 'https://stage.x.example' },
    { name: 'kand', status: 'stage', platform: 'platform1', link: 'https://stage.kand.example' },
    { name: 'ny-prod', status: 'prod', platform: 'platform1', link: 'https://ny.example' },
    { name: 'kundbox-okand', status: 'prod', platform: 'dedicated:kund', link: 'https://kund.example' },
    { name: 'kundbox', status: 'prod', platform: 'dedicated:kund', link: 'https://vald.example' },
    { name: 'dold', status: 'prod', platform: 'platform1', link: 'https://dold.example' },
    { name: 'utanfor', status: 'none', platform: 'none', link: 'https://github.com/x/y' },
  ];
  const { appar, overtaliga } = publikaAppar(kalla, ed);
  assert.deepEqual(appar, [
    { name: 'ny-prod', status: 'prod', url: 'https://ny.example' },
    { name: 'kundbox', status: 'prod', url: 'https://vald.example' },
    { name: 'kand', status: 'stage' },
  ]);
  assert.deepEqual(overtaliga, []);
  assert.throws(() => publikaAppar([{ name: 'x', status: 'prod', platform: 'platform1', link: 'http://osakert.example' }], {}));
  const manga = Array.from({ length: 10 }, (_, i) => ({ name: `a${i}`, status: 'prod', platform: 'platform1', link: `https://a${i}.example` }));
  const r = publikaAppar(manga, {});
  assert.equal(r.appar.length, MAX_BITAR);
  assert.deepEqual(r.overtaliga, ['a8', 'a9']);
});

test('pusslet: ny prod-app utan redaktionell text får en neutral bit', () => {
  const [bit] = sajtAppar([{ name: 'Ny-App', status: 'prod', url: 'https://ny.example' }], lasEditorial());
  assert.equal(bit.id, 'ny-app');
  assert.equal(bit.env, 'prod');
  assert.equal(bit.mono, 'Na');
  assert.deepEqual(bit.features, { sv: [], en: [] });
  assert.ok(bit.blurb.sv && bit.blurb.en);
});

test('pusselsynken: workflow med synk, test, deploy-knuff och keepalive', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'pusselsynk.yml'), 'utf8');
  assert.ok(wf.includes('build-apps.mjs --sync'));
  assert.ok(wf.includes('npm test'), 'testerna ska gå gröna före commit');
  assert.ok(wf.includes('PLATFORM_READ_TOKEN'));
  assert.ok(wf.includes('/enable'), 'keepalive mot inaktivitetsavstängning saknas');
});
