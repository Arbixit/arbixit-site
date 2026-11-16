// Arbetsorder via mejl: intagets och publiceringsstegets regler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ordergivare, arArbetsorder, tolkaSvar, nastaNr, orderfil, vantandeOrder, redanRegistrerat,
  sparradeSokvagar, patchfiler, allaDelarKlara, enRad,
} from '../scripts/order.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const intern = [{ name: 'X-MS-Exchange-Organization-AuthAs', value: 'Internal' }];

test('arbetsorder: kräver både uppdragsgivare och Exchange-intyg om internt mejl', () => {
  const givare = ordergivare(' Chef@Exempel.se , vd@exempel.se ');
  assert.deepEqual(givare, ['chef@exempel.se', 'vd@exempel.se']);
  assert.equal(arArbetsorder('chef@exempel.se', intern, givare), true);
  assert.equal(arArbetsorder('CHEF@exempel.se', intern, givare), true);
  // Rätt avsändare men utan intyg = förfalskad eller extern väg
  assert.equal(arArbetsorder('chef@exempel.se', [], givare), false);
  assert.equal(arArbetsorder('chef@exempel.se', [{ name: 'x-ms-exchange-organization-authas', value: 'Anonymous' }], givare), false);
  assert.equal(arArbetsorder('chef@exempel.se', undefined, givare), false);
  // Dubbla rubriker litar vi inte på
  assert.equal(arArbetsorder('chef@exempel.se', [...intern, ...intern], givare), false);
  // Internt mejl från någon annan är inte en order
  assert.equal(arArbetsorder('kollega@exempel.se', intern, givare), false);
  // Ingen lista = arbetsorder avstängt
  assert.deepEqual(ordergivare(undefined), []);
  assert.equal(arArbetsorder('chef@exempel.se', intern, []), false);
});

test('arbetsorder: bara ett kort, entydigt ja räknas som godkännande', () => {
  for (const ja of ['ok', 'OK', 'Ok!', 'okej.', 'Ja', 'Godkänd', 'godkänt', 'Kör', 'kör på', 'Publicera', '"ok"', 'ok\n\nMvh Chefen']) {
    assert.equal(tolkaSvar(ja), 'godkand', ja);
  }
  for (const nej of ['', '   ', 'ok men byt rubriken', 'Ok, fast kortare text', 'Nej', 'Vänta', 'Inte ok', 'ja men', 'okej då, ändra färgen först',
    'ok\n' + 'Här kommer en lång utläggning om allt möjligt som gör att svaret inte längre är ett kort och entydigt ja utan något annat.'.repeat(2)]) {
    assert.equal(tolkaSvar(nej), 'andring', nej);
  }
});

test('arbetsorder: numrering, filnamn, svar kopplas till väntande order', () => {
  assert.equal(nastaNr([]), 1);
  assert.equal(nastaNr([{ nr: 3 }, { nr: 7 }]), 8);
  assert.equal(orderfil(12), 'order-0012.json');
  const ordrar = [
    { nr: 1, konversation: 'a', status: 'klar', imid: '<1>' },
    { nr: 2, konversation: 'b', status: 'granskning', imid: '<2>', historik: [{ imid: '<2b>' }] },
    { nr: 3, konversation: 'c', status: 'fraga', imid: '<3>' },
  ];
  assert.equal(vantandeOrder(ordrar, 'b').nr, 2);
  assert.equal(vantandeOrder(ordrar, 'c').nr, 3);
  assert.equal(vantandeOrder(ordrar, 'a'), null, 'en avslutad order tar inte emot svar');
  assert.equal(vantandeOrder(ordrar, 'okänd'), null);
  assert.equal(redanRegistrerat(ordrar, '<2>'), true);
  assert.equal(redanRegistrerat(ordrar, '<2b>'), true);
  assert.equal(redanRegistrerat(ordrar, '<ny>'), false);
});

test('arbetsorder: spärrlistan skyddar automatik, kod, tester, juridik och domän', () => {
  const tillatna = ['index.html', 'data/editorial.json', 'icons/crm.png', 'assets/favicon.svg', 'PROJECT.md', 'arbixit-logo.svg'];
  assert.deepEqual(sparradeSokvagar(tillatna), []);
  const sparrade = ['.github/workflows/pusselsynk.yml', 'scripts/order.mjs', 'scripts/mail-act.mjs', 'test/site.test.js',
    'terms/index.html', 'privacy/index.html', 'CNAME', 'package.json', 'data/apps.json', 'legal.js', 'support.js',
    '../utanfor.txt', '/etc/passwd', '.claude/settings.json'];
  assert.deepEqual(sparradeSokvagar(sparrade), sparrade);
});

test('arbetsorder: patchens filer läses ur diff-raderna, även vid namnbyte', () => {
  const patch = 'diff --git a/index.html b/index.html\n--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-a\n+b\n'
    + 'diff --git a/icons/gammal.png b/scripts/ny.mjs\nsimilarity index 100%\n';
  assert.deepEqual(patchfiler(patch).sort(), ['icons/gammal.png', 'index.html', 'scripts/ny.mjs']);
  assert.deepEqual(sparradeSokvagar(patchfiler(patch)), ['scripts/ny.mjs']);
  assert.deepEqual(patchfiler(''), []);
});

test('arbetsorder: klar först när alla delar är publicerade', () => {
  assert.equal(allaDelarKlara({ patch: { site: 'x' }, applicerat: { site: 't' } }), true);
  assert.equal(allaDelarKlara({ patch: { site: 'x', brand: 'y' }, applicerat: { site: 't' } }), false);
  assert.equal(allaDelarKlara({ patch: { site: 'x', brand: 'y' }, applicerat: { site: 't', brand: 't' } }), true);
  assert.equal(allaDelarKlara({ patch: { site: 'x' } }), false);
  assert.equal(enRad('Rad ett\nrad två\t  slut'), 'Rad ett rad två slut');
  assert.equal(enRad('x'.repeat(200)).length, 72);
});

test('arbetsorder: inga mejladresser eller hemligheter i orderkoden', () => {
  for (const f of ['order.mjs', 'order-verkstall.mjs', 'mail-check.mjs']) {
    const s = readFileSync(join(root, 'scripts', f), 'utf8');
    assert.ok(!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s), `mejladress i klartext i scripts/${f}`);
    assert.ok(!/(client_secret|password)\s*[:=]\s*['"]/i.test(s), `hårdkodad hemlighet i scripts/${f}`);
  }
});

test('arbetsorder: workflows – intag utan AI, publicering efter godkännande', () => {
  const brev = readFileSync(join(root, '.github', 'workflows', 'brevbararen.yml'), 'utf8');
  assert.ok(brev.includes('ORDER_SENDERS: ${{ secrets.ORDER_SENDERS }}'));
  // AI-steget i det publika repot får aldrig uppdragsgivarnas adresser eller Graph-uppgifter
  const aiSteg = brev.slice(brev.indexOf('uses: anthropics/claude-code-action'), brev.indexOf('Svara, markera läst och logga'));
  assert.ok(!aiSteg.includes('ORDER_SENDERS') && !aiSteg.includes('GRAPH_'));
  const synk = readFileSync(join(root, '.github', 'workflows', 'pusselsynk.yml'), 'utf8');
  assert.ok(synk.includes('order-verkstall.mjs'));
  const kod = readFileSync(join(root, 'scripts', 'order-verkstall.mjs'), 'utf8');
  assert.ok(kod.includes("o.status === 'godkand'"), 'bara godkända order publiceras');
  assert.ok(kod.includes('sparradeSokvagar') && kod.includes('npm test'), 'spärrlista och tester kontrolleras före push');
  assert.ok(!/'add',\s*'-A'/.test(kod) && !kod.includes("'clean'"), 'bara patchens filer får committas – inga lösa filer');
  const check = readFileSync(join(root, 'scripts', 'mail-check.mjs'), 'utf8');
  assert.ok(check.includes("text: arOrder ? ''"), 'orderinnehåll skrivs inte till AI-stegets katalog');
});

test('arbetsorder: bara bilder följer med ordern, med tak på antal och storlek', async () => {
  const { bildbilagor, bilagefil, antalBilagor, MAX_BILAGOR, MAX_BILAGA_BYTE } = await import('../scripts/order.mjs');
  const b64 = (n) => Buffer.alloc(n, 1).toString('base64');
  const { bilder, overhoppade } = bildbilagor([
    { contentType: 'image/png', contentBytes: b64(10) },
    { contentType: 'IMAGE/JPEG; name=x', contentBytes: b64(10) },
    { contentType: 'application/pdf', contentBytes: b64(10) },
    { contentType: 'image/svg+xml', contentBytes: b64(10) }, // kan bära skript – tas inte med
    { contentType: 'image/png', contentBytes: b64(MAX_BILAGA_BYTE + 1) },
    { contentType: 'image/png' }, // referensbilaga utan innehåll
  ]);
  assert.deepEqual(bilder.map((b) => b.andelse), ['png', 'jpg']);
  assert.equal(overhoppade, 4);
  const manga = bildbilagor(Array.from({ length: MAX_BILAGOR + 2 }, () => ({ contentType: 'image/png', contentBytes: b64(4) })));
  assert.equal(manga.bilder.length, MAX_BILAGOR);
  assert.equal(manga.overhoppade, 2);
  assert.deepEqual(bildbilagor(undefined), { bilder: [], overhoppade: 0 });
  assert.equal(bilagefil(3, 2, 'png'), 'order-0003.bilaga-2.png');
  assert.equal(antalBilagor({ bilagor: ['a'], historik: [{ bilagor: ['b', 'c'] }, { text: 'x' }] }), 3);
  assert.equal(antalBilagor({}), 0);
});

test('arbetsorder: brevbäraren startar nästa led direkt, utan att AI-steget får nyckeln', () => {
  const brev = readFileSync(join(root, '.github', 'workflows', 'brevbararen.yml'), 'utf8');
  const aiSteg = brev.slice(brev.indexOf('uses: anthropics/claude-code-action'), brev.indexOf('Svara, markera läst och logga'));
  assert.ok(!aiSteg.includes('DISPATCH_TOKEN'), 'AI-steget får aldrig startnyckeln');
  const start = brev.slice(brev.indexOf('Starta nästa led direkt'));
  assert.ok(start.includes('gh workflow run pusselsynk.yml') && start.includes('gh workflow run arbetspass.yml'));
  assert.ok(start.includes("steps.kolla.outputs.arbete != '0' || steps.kolla.outputs.godkanda != '0'"), 'startar bara när det finns något att göra');
  assert.ok(/schedule:\s*\n\s*- cron:/.test(brev), 'schemat ligger kvar som reserv');
  const check = readFileSync(join(root, 'scripts', 'mail-check.mjs'), 'utf8');
  assert.ok(check.includes('arbete=${arbete}') && check.includes('godkanda=${godkanda}'));
});

test('arbetsorder: svar på en utkastnotis kopplas till ordern som utkastet kom ur', async () => {
  const { utkastOrder } = await import('../scripts/order.mjs');
  const ordrar = [
    { nr: 3, status: 'session', utkast: ['2026-11-16 Arbixit Applogor forslag'] },
    { nr: 8, status: 'session', utkast: ['2026-12-01 Arbixit Brandbok utkast'] },
    { nr: 9, status: 'klar', utkast: ['2026-10-01 Gammalt utkast'] },
    { nr: 10, status: 'session' },
  ];
  const amne = 'Sv: Nytt utkast i 05 For approval: 00 Oversikt.png';
  const text = 'Godkänt\n\nhttps://exempel.invalid/05%20For%20approval/2026-11-16%20Arbixit%20Applogor%20forslag/00%20Oversikt.png';
  assert.equal(utkastOrder(ordrar, amne, text).nr, 3);
  assert.equal(utkastOrder(ordrar, 'Uppgift', text), null, 'bara svar på notisen kopplas – en ny order som nämner mappen förblir en ny order');
  assert.equal(utkastOrder(ordrar, amne, 'Godkänt'), null, 'ingen order pekas ut');
  assert.equal(utkastOrder(ordrar, amne, 'x 2026-10-01 Gammalt utkast'), null, 'avslutade order tar inte emot svar');
  assert.equal(utkastOrder(ordrar, amne, text + ' 2026-12-01 Arbixit Brandbok utkast'), null, 'två möjliga order – hellre ingen koppling än fel');
  assert.equal(utkastOrder([{ nr: 1, status: 'session', utkast: ['abc', '', 7] }], amne, 'abc'), null, 'för korta eller trasiga namn räknas inte');
  const check = readFileSync(join(root, 'scripts', 'mail-check.mjs'), 'utf8');
  assert.ok(check.includes("viaUtkast.status = 'sessionklar'"));
});
