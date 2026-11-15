#!/usr/bin/env node
// Publicerar GODKÄNDA arbetsorder i detta repo. Deterministiskt, inga AI-anrop.
//
//   node scripts/order-verkstall.mjs
//
// Körs av pusselsynken varje timme. För varje order i SharePoint-kön med
// status "godkand" och en sajt-patch som ännu inte är applicerad:
//   1. patchen hämtas och får bara röra tillåtna filer (sparradeSokvagar)
//   2. den måste passa på aktuell main (annars görs ordern om)
//   3. testerna måste gå gröna (annars rullas allt tillbaka)
//   4. commit + push till main – GitHub Pages publicerar
//   5. uppdragsgivaren får en bekräftelse som svar i samma mejltråd
//
// Patchen skapas av arbetspasset i arbixit-brand och godkänns per mejl av en
// uppdragsgivare (brevbäraren sätter status "godkand"). Detta steg litar inte
// på någon av dem: spärrlistan och testerna kontrolleras här igen, i repot
// som ändras. Loggar aldrig orderinnehåll (Actions-loggarna är publika).

import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getToken, graph, hamtaLogg, skrivLogg, kravEnv } from './graph.mjs';
import { lasOrdrar, skrivOrder, lasFil, sparradeSokvagar, patchfiler, allaDelarKlara, enRad } from './order.mjs';

const SIGNATUR = 'Claude, Digital Brand & Web Manager (AI), Arbixit';
const mailbox = encodeURIComponent(kravEnv('MAIL_MAILBOX'));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cell = (s) => String(s ?? '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 120);

const token = await getToken();

async function meddela(order, text, notis) {
  await graph(token, `/users/${mailbox}/messages/${encodeURIComponent(order.mejlId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: escapeHtml(`${text}\n\n${SIGNATUR}`).replace(/\n/g, '<br>') }),
  });
  const logg = (await hamtaLogg(token)) ?? '';
  await skrivLogg(token, `${logg.trimEnd()}\n| ${new Date().toISOString().slice(0, 16)} | ${cell(order.fran?.adress)} | ${cell(order.amne)} | svarat | ${cell(notis)} |\n`);
}

const notera = (order, text) => {
  order.historik = [...(order.historik ?? []), { tid: new Date().toISOString(), typ: 'system', text }];
};

const aktuella = (await lasOrdrar(token)).filter((o) => o.status === 'godkand' && o.patch?.site && !o.applicerat?.site);
let publicerade = 0;
let ejPublicerade = 0;

for (const order of aktuella) {
  const patch = await lasFil(token, order.patch.site);
  const sparrade = patch ? sparradeSokvagar(patchfiler(patch)) : [];
  if (!patch || patchfiler(patch).length === 0 || sparrade.length > 0) {
    order.status = 'fel';
    notera(order, patch ? 'Publiceringen stoppades: ändringen rör filer som inte får ändras via arbetsorder.' : 'Publiceringen stoppades: ändringsfilen saknas.');
    await skrivOrder(token, order);
    await meddela(order, `Order ${order.nr} kunde inte publiceras: ändringen rör delar av sajten som inte får ändras via arbetsorder. Ingenting är ändrat. Det här behöver tas i en vanlig arbetssession.`, `arbetsorder ${order.nr}: publicering stoppad (spärrad fil)`);
    ejPublicerade += 1;
    continue;
  }

  const fil = join(mkdtempSync(join(tmpdir(), 'order-')), 'andring.patch');
  writeFileSync(fil, patch);
  try {
    git('apply', '--check', fil);
  } catch {
    order.status = 'andring';
    notera(order, 'Ändringen passade inte längre på sajten, som ändrats sedan granskningen. Ordern görs om och granskas på nytt.');
    await skrivOrder(token, order);
    await meddela(order, `Order ${order.nr} gick inte att publicera eftersom sajten har ändrats sedan du granskade den. Jag gör om ändringen och skickar en ny granskning. Ingenting är publicerat.`, `arbetsorder ${order.nr}: görs om (sajten ändrad)`);
    ejPublicerade += 1;
    continue;
  }

  git('apply', '--index', fil);
  let testOk = true;
  try {
    execSync('node scripts/build-apps.mjs && npm test', { stdio: 'pipe' });
    // Bara patchens egna filer är köade (apply --index) plus det genererade
    // pusslet. Aldrig "git add -A": lösa filer i katalogen får inte följa med
    // in i detta publika repo.
    git('add', 'index.html');
  } catch {
    testOk = false;
  }
  if (!testOk) {
    git('reset', '--hard', '-q', 'HEAD');
    order.status = 'fel';
    notera(order, 'Publiceringen stoppades: sajtens tester gick inte igenom med ändringen. Allt rullades tillbaka.');
    await skrivOrder(token, order);
    await meddela(order, `Order ${order.nr} kunde inte publiceras: sajtens kontroller gick inte igenom med ändringen, så jag rullade tillbaka den. Ingenting är ändrat på sajten. Jag tar upp det i nästa rapport.`, `arbetsorder ${order.nr}: publicering stoppad (tester röda)`);
    ejPublicerade += 1;
    continue;
  }

  git('commit', '-q', '-m', `Arbetsorder ${order.nr}: ${enRad(order.sammanfattning) || 'ändring enligt godkänd order'}`);
  git('push', '-q'); // misslyckas pushen blir körningen röd och ordern tas om nästa timme

  order.applicerat = { ...(order.applicerat ?? {}), site: new Date().toISOString() };
  notera(order, 'Sajtändringen är publicerad.');
  const klar = allaDelarKlara(order);
  if (klar) order.status = 'klar';
  await skrivOrder(token, order);
  if (klar) {
    await meddela(order, `Order ${order.nr} är publicerad. Ändringen syns på https://www.arbixit.se/ inom ett par minuter.`, `arbetsorder ${order.nr}: publicerad`);
  }
  publicerade += 1;
}

console.log(`Arbetsorder: ${publicerade} publicerade, ${ejPublicerade} stoppade eller omgjorda.`);
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `publicerade=${publicerade}\n`);
}
