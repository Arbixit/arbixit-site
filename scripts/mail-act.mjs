#!/usr/bin/env node
// Brevbärarens deterministiska slutled: verkställer AI-stegets åtgärdsfiler.
//
//   node scripts/mail-act.mjs --post <katalog> --utkorg <katalog>
//
// Per mejl i --post (skrivna av mail-check.mjs) läses åtgärdsfilen med samma
// namn i --utkorg: {"atgard":"svara"|"ignorera","svarstext":"...","notis":"..."}.
// Policyn (Mejlpolicy för digital medarbetare) upprätthålls här, i kod:
//  - svar går ALLTID via Graph "reply" på ursprungsmejlet – mottagaren kan
//    aldrig väljas av AI-steget, och nya mejl kan inte skapas
//  - signaturen läggs alltid på
//  - högst 5 svar per körning (massutskicksskydd)
//  - varje hanterat mejl loggas (tidpunkt, avsändare, ämne, åtgärd, notis)
//    till mejlloggen i 00 Styrning på SharePoint
//
// Ordningen är vald för att aldrig kunna dubbelskicka: FÖRST skrivs
// "hanterad"-markörer till mejlloggen (mail-check.mjs dubblettskydd), SEDAN
// skickas svaren, SIST skrivs loggraderna. Läst-markering försöks men är
// inte kritisk: utan Mail.ReadWrite (403) lämnas mejlet oläst med en varning
// – dubblettskyddet gör att det ändå aldrig hanteras igen.
// Saknas en åtgärdsfil lämnas mejlet omarkerat (AI får nytt försök nästa
// varv) och körningen felmarkeras. Loggar aldrig mejlinnehåll till stdout
// (Actions-loggarna är publika).

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getToken, graph, GRAPH, hamtaLogg, skrivLogg, kravEnv, arg, fail } from './graph.mjs';

const SIGNATUR = 'Claude, Digital Brand & Web Manager (AI), Arbixit';
const MAX_SVAR = 5;
const MAX_SVARSTEXT = 5000;

const post = arg('post');
const utkorg = arg('utkorg');
if (!post || !utkorg) fail('användning: node scripts/mail-act.mjs --post <katalog> --utkorg <katalog>');
const mailbox = encodeURIComponent(kravEnv('MAIL_MAILBOX'));

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Loggen är en markdown-tabell – celltext får inte bryta rader eller kolumner.
const cell = (s) => String(s ?? '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 120);

const token = await getToken();
const mejlfiler = (await readdir(post)).filter((f) => f.endsWith('.json')).sort();

// 1. Samla giltiga åtgärder.
const poster = [];
let saknade = 0;
for (const fil of mejlfiler) {
  const mejl = JSON.parse(await readFile(join(post, fil), 'utf8'));
  let atgardsfil;
  try {
    atgardsfil = JSON.parse(await readFile(join(utkorg, fil), 'utf8'));
  } catch {
    saknade += 1;
    console.error(`Åtgärdsfil saknas eller är ogiltig för mejl ${fil} – nytt försök nästa varv.`);
    continue;
  }
  const { atgard, svarstext, notis } = atgardsfil;
  const giltigSvara = atgard === 'svara' && typeof svarstext === 'string' && svarstext.trim();
  if (!giltigSvara && atgard !== 'ignorera') {
    saknade += 1;
    console.error(`Ogiltig åtgärd för mejl ${fil} – nytt försök nästa varv.`);
    continue;
  }
  poster.push({ mejl, atgard, svarstext, notis });
}
const svarsposter = poster.filter((p) => p.atgard === 'svara').slice(0, MAX_SVAR);

// 2. Skriv hanterad-markörer INNAN något skickas – kraschar vi efter detta
//    blir mejlet obesvarat (syns som röd körning), aldrig dubbelbesvarat.
let logg = await hamtaLogg(token);
if (logg === null) {
  logg =
    '# Mejllogg – delade Claude-postlådan\n\n' +
    'All hantering i den delade postlådan, per "Mejlpolicy för digital medarbetare".\n' +
    'Skrivs automatiskt av brevbäraren i arbixit-site. Markörerna i html-kommentarer\n' +
    'är dubblettskyddets liggare – ta inte bort dem.\n\n' +
    '| Tidpunkt (UTC) | Avsändare | Ämne | Åtgärd | Notis |\n|---|---|---|---|---|\n';
}
if (poster.length > 0) {
  logg = `${logg.trimEnd()}\n${poster.map((p) => `<!-- hanterad: ${p.mejl.imid} -->`).join('\n')}\n`;
  await skrivLogg(token, logg);
}

// 3. Verkställ.
let svar = 0;
let ignorerade = 0;
let lastVarning = false;
const rader = [];
for (const p of poster) {
  let utfort;
  if (p.atgard === 'svara' && svarsposter.includes(p)) {
    const brodtext = `${p.svarstext.trim().slice(0, MAX_SVARSTEXT)}\n\n${SIGNATUR}`;
    await graph(token, `/users/${mailbox}/messages/${encodeURIComponent(p.mejl.id)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: escapeHtml(brodtext).replace(/\n/g, '<br>') }),
    });
    svar += 1;
    utfort = 'svarat';
  } else {
    ignorerade += 1;
    utfort = 'ignorerat';
  }
  // Läst-markering kräver Mail.ReadWrite – bäst möjliga försök, aldrig fatal.
  const patch = await fetch(`${GRAPH}/users/${mailbox}/messages/${encodeURIComponent(p.mejl.id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
  if (!patch.ok) lastVarning = true;
  rader.push(
    `| ${new Date().toISOString().slice(0, 16)} | ${cell(p.mejl.fran?.adress)} | ${cell(p.mejl.amne)} | ${utfort} | ${cell(p.notis)} |`,
  );
}

// 4. Loggrader.
if (rader.length > 0) {
  await skrivLogg(token, `${logg.trimEnd()}\n${rader.join('\n')}\n`);
}

if (lastVarning) {
  console.error('Varning: kunde inte markera mejl som lästa (Mail.ReadWrite saknas?) – dubblettskyddet tar över.');
}
console.log(`Klart: ${svar} svarade, ${ignorerade} ignorerade, ${rader.length} loggrader till 00 Styrning.`);
if (saknade > 0) fail(`${saknade} mejl utan giltig åtgärd – nytt försök nästa varv.`);
