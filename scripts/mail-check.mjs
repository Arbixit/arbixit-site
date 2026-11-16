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
//  3. Arbetsorder: mejl från en uppdragsgivare (ORDER_SENDERS) som Exchange
//     intygar är internt registreras som arbetsorder i SharePoint och får
//     ett färdigt kvitto. De når aldrig AI-steget här – innehållet skrivs
//     inte ens till --post. Se scripts/order.mjs.
//     Bilder i ordermejlet sparas bredvid ordern i SharePoint.
//
// Skriver till GITHUB_OUTPUT: olasta=<antal nya>, aibehov=<antal till AI>,
// arbete=<order som väntar på arbetspass>, godkanda=<order som godkänts>.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getToken, graph, hamtaLogg, hanteradeIdn, kravEnv, arg, fail } from './graph.mjs';
import {
  ordergivare, arArbetsorder, tolkaSvar, nastaNr, vantandeOrder, redanRegistrerat, lasOrdrar, skrivOrder,
  bildbilagor, bilagefil, antalBilagor, skrivFil, ORDERMAPP,
} from './order.mjs';

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
  $select: 'id,internetMessageId,conversationId,subject,from,receivedDateTime,body,uniqueBody,internetMessageHeaders',
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
let orderantal = 0;

// Arbetsorder. Orderkön läses bara om det faktiskt kommit ett ordermejl.
const givare = ordergivare();
let ordrar = null;
let arbete = 0; // order som nu väntar på arbetspasset
let godkanda = 0; // order som just godkänts och ska publiceras
// Startas nästa led direkt (se sista steget i workflowen) eller väntar det på schemat?
const direkt = process.env.DIREKTSTART === 'true';
const NAR = direkt ? 'Jag börjar med den direkt' : 'Jag tar den vid nästa arbetspass (det kan dröja några timmar)';

/** Sparar mejlets bilder bredvid ordern. Ger filnamnen; innehållet loggas aldrig. */
async function sparaBilagor(m, order) {
  const res = await graph(token, `/users/${mailbox}/messages/${encodeURIComponent(m.id)}/attachments`);
  const { bilder, overhoppade } = bildbilagor((await res.json()).value);
  let lopnr = antalBilagor(order);
  const filer = [];
  for (const b of bilder) {
    lopnr += 1;
    const fil = bilagefil(order.nr, lopnr, b.andelse);
    await skrivFil(token, `${ORDERMAPP}/${fil}`, b.data);
    filer.push(fil);
  }
  return { filer, overhoppade };
}
const bilagetext = ({ filer, overhoppade }) =>
  (filer.length ? ` ${filer.length === 1 ? 'Bilden' : `De ${filer.length} bilderna`} i mejlet följer med.` : '')
  + (overhoppade ? ` ${overhoppade} ${overhoppade === 1 ? 'bilaga' : 'bilagor'} kunde jag inte ta med (bara bilder upp till 4 MB, högst 6 per mejl).` : '');

async function registreraOrder(m, fran, amne) {
  ordrar ??= await lasOrdrar(token);
  if (redanRegistrerat(ordrar, m.internetMessageId)) {
    return { atgard: 'ignorera', notis: 'arbetsorder: mejlet var redan registrerat' };
  }
  const nu = new Date().toISOString();
  const handelse = { tid: m.receivedDateTime, fran, imid: m.internetMessageId };
  const order = vantandeOrder(ordrar, m.conversationId);
  if (order) {
    // Svar på ett granskningsmejl eller en motfråga.
    const svar = (m.uniqueBody?.content ?? m.body?.content ?? '').slice(0, MAX_TEXT);
    const efterGranskning = order.status === 'granskning' && m.receivedDateTime > (order.granskningSkickad ?? '');
    const godkand = efterGranskning && tolkaSvar(svar) === 'godkand';
    const varFraga = order.status === 'fraga';
    // Bilder i ett svar följer med när ordern ska göras om – inte vid ett rent ok.
    const bil = godkand ? { filer: [], overhoppade: 0 } : await sparaBilagor(m, order);
    order.historik = [...(order.historik ?? []), { ...handelse, typ: godkand ? 'godkannande' : 'svar', text: svar, ...(bil.filer.length ? { bilagor: bil.filer } : {}) }];
    order.mejlId = m.id;
    order.status = godkand ? 'godkand' : 'andring';
    if (godkand) { order.godkandAv = fran; order.godkandTid = nu; }
    await skrivOrder(token, order);
    if (godkand) {
      godkanda += 1;
      return { atgard: 'svara', notis: `arbetsorder ${order.nr}: godkänd`,
        svarstext: `Tack – order ${order.nr} är godkänd och publiceras ${direkt ? 'nu direkt' : 'vid nästa körning (det kan dröja några timmar)'}. Du får en bekräftelse när den ligger ute.` };
    }
    arbete += 1;
    return { atgard: 'svara', notis: `arbetsorder ${order.nr}: ${varFraga ? 'svar på motfråga' : 'ändring begärd'}`,
      svarstext: varFraga
        ? `Tack – jag fortsätter med order ${order.nr} utifrån ditt svar och återkommer med en granskning.${bilagetext(bil)}`
        : `Mottaget – jag gör om order ${order.nr} utifrån ditt svar och skickar en ny granskning. Ingenting är publicerat.${bilagetext(bil)}` };
  }
  const ny = {
    nr: nastaNr(ordrar),
    status: 'ny',
    skapad: nu,
    fran: { namn: m.from?.emailAddress?.name ?? '', adress: fran },
    amne,
    mottaget: m.receivedDateTime,
    text: (m.body?.content ?? '').slice(0, MAX_TEXT),
    imid: m.internetMessageId,
    mejlId: m.id,
    konversation: m.conversationId,
    version: 0,
    historik: [],
  };
  const bil = await sparaBilagor(m, ny);
  if (bil.filer.length) ny.bilagor = bil.filer;
  await skrivOrder(token, ny);
  ordrar.push(ny);
  arbete += 1;
  return { atgard: 'svara', notis: `arbetsorder ${ny.nr}: registrerad`,
    svarstext: `Mottaget – jag har lagt det här som arbetsorder ${ny.nr}.${bilagetext(bil)}\n\n${NAR}. Sedan får du ett mejl som beskriver vad jag gjort. Ingenting publiceras förrän du har svarat ok på det mejlet.` };
}
for (const m of mejl) {
  if (hanterade.has(m.internetMessageId)) {
    vantar += 1; // redan hanterat men oläst (Mail.ReadWrite saknas) – rör ej
    continue;
  }
  if (i >= MAX_PER_KORNING) break;
  i += 1;
  const fran = (m.from?.emailAddress?.address ?? '').toLowerCase();
  const amne = m.subject ?? '(utan ämne)';
  // Loopskyddet går före: egna svar och systemavsändare blir aldrig arbetsorder.
  const arOrder = givare.length > 0 && !autoIgnorera(fran, amne) && arArbetsorder(fran, m.internetMessageHeaders, givare);
  await writeFile(
    join(post, `${i}.json`),
    JSON.stringify(
      {
        id: m.id,
        imid: m.internetMessageId,
        fran: { namn: m.from?.emailAddress?.name ?? '', adress: fran },
        amne,
        mottaget: m.receivedDateTime,
        // Ordermejl hanteras deterministiskt – innehållet lämnar aldrig Graph här.
        text: arOrder ? '' : (m.body?.content ?? '').slice(0, MAX_TEXT),
      },
      null,
      2,
    ),
  );
  if (arOrder) {
    await writeFile(join(utkorg, `${i}.json`), JSON.stringify(await registreraOrder(m, fran, amne)));
    orderantal += 1;
    continue;
  }
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

console.log(`Nya olästa mejl: ${i} (till AI-steget: ${aibehov}, arbetsorder: ${orderantal}, redan hanterade: ${vantar})`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `olasta=${i}\naibehov=${aibehov}\narbete=${arbete}\ngodkanda=${godkanda}\n`);
}
