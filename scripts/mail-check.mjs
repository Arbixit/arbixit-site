#!/usr/bin/env node
// Brevbärarens deterministiska koll (inga AI-anrop): hämtar olästa mejl i
// den delade postlådan och skriver dem som JSON-filer till --post-katalogen
// (utanför repot, committas aldrig). Loggar ENDAST antal – aldrig avsändare,
// ämne eller innehåll (Actions-loggarna är publika i detta repo).
//
//   node scripts/mail-check.mjs --post <katalog> --utkorg <katalog>
//
// Två deterministiska skydd, före AI:
//  1. Dubblettskydd: mejl vars internetMessageId redan står som
//     "hanterad"-markör i mejlloggen (00 Styrning) hoppas över helt. Utan
//     Mail.ReadWrite kan brevbäraren inte markera mejl som lästa – utan
//     detta skydd skulle samma mejl besvaras om var 30:e minut.
//  2. Loopskydd: svar från egna postlådan ("Re:" från oss själva) och
//     no-reply-/systemavsändare får en färdig åtgärdsfil "ignorera" i
//     --utkorg direkt – de når aldrig AI-steget men loggas av mail-act.mjs.
//
// Skriver till GITHUB_OUTPUT: olasta=<antal nya>, aibehov=<antal till AI>.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getToken, graph, hamtaLogg, hanteradeIdn, kravEnv, arg, fail } from './graph.mjs';

const MAX_PER_KORNING = 5; // massutskicksskydd, se mejlpolicyn
const MAX_TEXT = 10000; // tak på mejltext till AI-steget

const post = arg('post');
const utkorg = arg('utkorg');
if (!post || !utkorg) fail('användning: node scripts/mail-check.mjs --post <katalog> --utkorg <katalog>');
const egenAdress = kravEnv('MAIL_MAILBOX').toLowerCase();
const mailbox = encodeURIComponent(egenAdress);

function autoIgnorera(fran, amne) {
  if (fran === egenAdress && /^(re|sv|aw):/i.test(amne)) return 'eget svar (loopskydd)';
  if (/no-?reply|mailer-daemon|postmaster/i.test(fran)) return 'systemavsändare (no-reply)';
  return null;
}

const token = await getToken();
const q = new URLSearchParams({
  $filter: 'isRead eq false',
  $top: '25',
  $select: 'id,internetMessageId,subject,from,receivedDateTime,body',
});
const res = await graph(token, `/users/${mailbox}/mailFolders/inbox/messages?${q}`, {
  headers: { Prefer: 'outlook.body-content-type="text"' },
});
const mejl = (await res.json()).value ?? [];
const hanterade = mejl.length > 0 ? hanteradeIdn(await hamtaLogg(token)) : new Set();

await mkdir(post, { recursive: true });
await mkdir(utkorg, { recursive: true });
let i = 0;
let aibehov = 0;
let vantar = 0;
for (const m of mejl) {
  if (hanterade.has(m.internetMessageId)) {
    vantar += 1; // redan hanterat men oläst (Mail.ReadWrite saknas) – rör ej
    continue;
  }
  if (i >= MAX_PER_KORNING) break;
  i += 1;
  const fran = (m.from?.emailAddress?.address ?? '').toLowerCase();
  const amne = m.subject ?? '(utan ämne)';
  await writeFile(
    join(post, `${i}.json`),
    JSON.stringify(
      {
        id: m.id,
        imid: m.internetMessageId,
        fran: { namn: m.from?.emailAddress?.name ?? '', adress: fran },
        amne,
        mottaget: m.receivedDateTime,
        text: (m.body?.content ?? '').slice(0, MAX_TEXT),
      },
      null,
      2,
    ),
  );
  const skal = autoIgnorera(fran, amne);
  if (skal) {
    await writeFile(
      join(utkorg, `${i}.json`),
      JSON.stringify({ atgard: 'ignorera', notis: `automatiskt: ${skal}` }),
    );
  } else {
    aibehov += 1;
  }
}

console.log(`Nya olästa mejl: ${i} (till AI-steget: ${aibehov}, redan hanterade: ${vantar})`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `olasta=${i}\naibehov=${aibehov}\n`);
}
