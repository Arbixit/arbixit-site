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
//  - varje hanterat mejl markeras läst och loggas (tidpunkt, avsändare,
//    ämne, åtgärd, notis) till mejlloggen i 00 Styrning på SharePoint
// Saknas en åtgärdsfil lämnas mejlet oläst (fångas nästa varv) och körningen
// felmarkeras. Loggar aldrig mejlinnehåll till stdout (publika Actions-loggar).

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getToken, graph, GRAPH, kravEnv, arg, fail } from './graph.mjs';

const SIGNATUR = 'Claude, Digital Brand & Web Manager (AI), Arbixit';
const MAX_SVAR = 5;
const MAX_SVARSTEXT = 5000;
const LOGGFIL = '00 Styrning/Mejllogg claude-arbore.md';
const DEFAULT_SITE_ID =
  'arbore.sharepoint.com,8e3e367a-cea8-4c1c-9f12-f5383ff991c8,c8f652e7-39d6-4767-b2d2-ed6645c399a8';

const post = arg('post');
const utkorg = arg('utkorg');
if (!post || !utkorg) fail('användning: node scripts/mail-act.mjs --post <katalog> --utkorg <katalog>');
const mailbox = encodeURIComponent(kravEnv('MAIL_MAILBOX'));
const siteId = process.env.GRAPH_SITE_ID ?? DEFAULT_SITE_ID;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Loggen är en markdown-tabell – celltext får inte bryta rader eller kolumner.
const cell = (s) => String(s ?? '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 120);

const token = await getToken();
const mejlfiler = (await readdir(post)).filter((f) => f.endsWith('.json')).sort();

let svar = 0;
let ignorerade = 0;
let saknade = 0;
const loggrader = [];

for (const fil of mejlfiler) {
  const mejl = JSON.parse(await readFile(join(post, fil), 'utf8'));
  let atgardsfil;
  try {
    atgardsfil = JSON.parse(await readFile(join(utkorg, fil), 'utf8'));
  } catch {
    saknade += 1;
    console.error(`Åtgärdsfil saknas eller är ogiltig för mejl ${fil} – lämnas oläst till nästa varv.`);
    continue;
  }
  const { atgard, svarstext, notis } = atgardsfil;

  let utfort;
  if (atgard === 'svara' && typeof svarstext === 'string' && svarstext.trim() && svar < MAX_SVAR) {
    const brodtext = `${svarstext.trim().slice(0, MAX_SVARSTEXT)}\n\n${SIGNATUR}`;
    await graph(token, `/users/${mailbox}/messages/${encodeURIComponent(mejl.id)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: escapeHtml(brodtext).replace(/\n/g, '<br>') }),
    });
    svar += 1;
    utfort = 'svarat';
  } else if (atgard === 'ignorera') {
    ignorerade += 1;
    utfort = 'ignorerat';
  } else {
    saknade += 1;
    console.error(`Ogiltig åtgärd för mejl ${fil} – lämnas oläst till nästa varv.`);
    continue;
  }

  await graph(token, `/users/${mailbox}/messages/${encodeURIComponent(mejl.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
  loggrader.push(
    `| ${new Date().toISOString().slice(0, 16)} | ${cell(mejl.fran?.adress)} | ${cell(mejl.amne)} | ${utfort} | ${cell(notis)} |`,
  );
}

// Mejlloggen i 00 Styrning: hämta befintlig, lägg till raderna, ladda upp.
if (loggrader.length > 0) {
  const loggPath = LOGGFIL.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${loggPath}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let logg;
  if (res.ok) {
    logg = await res.text();
  } else if (res.status === 404) {
    logg =
      '# Mejllogg – delade Claude-postlådan\n\n' +
      'All hantering i den delade postlådan, per "Mejlpolicy för digital medarbetare".\n' +
      'Skrivs automatiskt av brevbäraren i arbixit-site.\n\n' +
      '| Tidpunkt (UTC) | Avsändare | Ämne | Åtgärd | Notis |\n|---|---|---|---|---|\n';
  } else {
    fail(`kunde inte läsa mejlloggen (HTTP ${res.status}).`);
  }
  const put = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${loggPath}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
    body: `${logg.trimEnd()}\n${loggrader.join('\n')}\n`,
  });
  if (!put.ok) fail(`kunde inte skriva mejlloggen (HTTP ${put.status}).`);
}

console.log(`Klart: ${svar} svarade, ${ignorerade} ignorerade, ${loggrader.length} loggrader till 00 Styrning.`);
if (saknade > 0) fail(`${saknade} mejl utan giltig åtgärd – lämnade olästa.`);
