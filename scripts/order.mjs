// Arbetsorder via mejl – gemensamma delar för brevbäraren (intag) och
// publiceringssteget i pusselsynken.
//
// En arbetsorder är ett mejl från en av uppdragsgivarna som Exchange intygar
// kommer inifrån organisationen. Ordern sparas som en JSON-fil i SharePoint
// (00 Styrning/Arbetsorder) – aldrig i detta publika repo. Arbetet utförs av
// arbetspasset i det privata repot arbixit-brand, som lägger ändringen som en
// patch bredvid ordern. INGENTING publiceras förrän en uppdragsgivare svarat
// "ok" på granskningsmejlet (försiktiga varianten, beslut 2026-11-15).
//
// Livscykel:
//   ny ──► granskning ──(svar "ok")──► godkand ──► klar
//             │  ▲
//   (annat svar) │
//             ▼  │
//           andring          fraga = väntar på svar på en motfråga
//                            rott  = kräver en uppdragsgivare själv
//                            fel   = gick inte att genomföra
//
// Uppdragsgivarnas adresser ligger i Actions-secreten ORDER_SENDERS
// (kommaseparerade) – inga adresser i klartext i detta publika repo.

import { GRAPH, fail } from './graph.mjs';

export const ORDERMAPP = '00 Styrning/Arbetsorder';
const DEFAULT_SITE_ID =
  'arbore.sharepoint.com,8e3e367a-cea8-4c1c-9f12-f5383ff991c8,c8f652e7-39d6-4767-b2d2-ed6645c399a8';

// ---------- rena funktioner ----------

/** Adresslistan ur ORDER_SENDERS, gemener. Tom lista = arbetsorder avstängt. */
export function ordergivare(env = process.env.ORDER_SENDERS) {
  return String(env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Är mejlet en arbetsorder? Kräver BÅDE att avsändaren är en uppdragsgivare
 * OCH att Exchange stämplat mejlet som internt autentiserat. Avsändaradressen
 * ensam räcker inte – den kan förfalskas utifrån. Rubriken
 * X-MS-Exchange-Organization-AuthAs sätts av Exchange självt och rensas bort
 * från inkommande externt mejl.
 */
export function arArbetsorder(fran, rubriker, givare) {
  if (!givare.includes(String(fran ?? '').toLowerCase())) return false;
  const authAs = (rubriker ?? []).filter((r) => String(r.name).toLowerCase() === 'x-ms-exchange-organization-authas');
  return authAs.length === 1 && String(authAs[0].value).trim().toLowerCase() === 'internal';
}

const JAORD = ['ok', 'okej', 'okay', 'ja', 'japp', 'godkänd', 'godkänt', 'godkänner', 'godkand', 'kör', 'kör på', 'publicera'];

/**
 * Tolkar ett svar på ett granskningsmejl. Bara ett kort, entydigt ja räknas
 * som godkännande – allt annat ("ok, men byt rubriken") blir en ändring som
 * ger en ny granskning. Hellre en granskning för mycket än en publicering
 * för mycket.
 */
export function tolkaSvar(text) {
  const rader = String(text ?? '').replace(/\r/g, '').split('\n').map((r) => r.trim()).filter(Boolean);
  if (rader.length === 0) return 'andring';
  const forsta = rader[0].toLowerCase().replace(/[.!,;:\s]+$/g, '').replace(/^[\s"'“”]+|["'“”]+$/g, '');
  const kort = rader.join(' ').length <= 120;
  return kort && JAORD.includes(forsta) ? 'godkand' : 'andring';
}

export const nastaNr = (ordrar) => ordrar.reduce((max, o) => Math.max(max, o.nr ?? 0), 0) + 1;
export const orderfil = (nr) => `order-${String(nr).padStart(4, '0')}.json`;

/** Hittar ordern som ett svar hör till: samma konversation och väntar på svar. */
export function vantandeOrder(ordrar, konversation) {
  return ordrar.find((o) => o.konversation === konversation && ['granskning', 'fraga'].includes(o.status)) ?? null;
}

/** Har mejlet redan registrerats (som order eller som svar)? */
export function redanRegistrerat(ordrar, imid) {
  return ordrar.some((o) => o.imid === imid || (o.historik ?? []).some((h) => h.imid === imid));
}

/**
 * Sökvägar som en arbetsorder aldrig får ändra i detta repo: automatiken
 * själv, mejl- och orderkoden, testerna, de juridiska sidorna, domänen och
 * den dashboard-genererade app-datan. Sådant kräver en vanlig arbetssession.
 */
const SPARRADE = [
  /^\.github\//, /^\.claude\//, /^scripts\//, /^test\//, /^terms\//, /^privacy\//, /^design\//, /^motor\//,
  /^CNAME$/, /^CLAUDE\.md$/, /^\.nojekyll$/, /^package(-lock)?\.json$/, /^data\/apps\.json$/, /^legal\.(css|js)$/, /^support\.js$/, /^_ds\//,
];
export function sparradeSokvagar(sokvagar) {
  return sokvagar.filter((s) => s.includes('..') || s.startsWith('/') || SPARRADE.some((re) => re.test(s)));
}

/** Filerna en patch rör (ur "diff --git a/… b/…"-raderna). */
export function patchfiler(patch) {
  const ut = new Set();
  for (const m of String(patch).matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) { ut.add(m[1]); ut.add(m[2]); }
  return [...ut];
}

/** Ordern är klar när alla dess delar är publicerade. */
export function allaDelarKlara(order) {
  const p = order.patch ?? {};
  const a = order.applicerat ?? {};
  return (!p.site || !!a.site) && (!p.brand || !!a.brand);
}

/** En rad, utan styrtecken – för commit-meddelanden. */
export const enRad = (s, max = 72) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- SharePoint ----------

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const drive = (p, suffix = '') => `${GRAPH}/sites/${process.env.GRAPH_SITE_ID ?? DEFAULT_SITE_ID}/drive/root:/${enc(p)}${suffix}`;

export async function lasFil(token, sokvag) {
  const res = await fetch(drive(sokvag, ':/content'), { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res.text();
  if (res.status === 404) return null;
  fail(`kunde inte läsa en fil i orderkön (HTTP ${res.status}).`);
}

export async function skrivFil(token, sokvag, text) {
  const res = await fetch(drive(sokvag, ':/content'), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: text,
  });
  if (!res.ok) fail(`kunde inte skriva en fil i orderkön (HTTP ${res.status}).`);
}

export async function lasOrdrar(token) {
  const res = await fetch(drive(ORDERMAPP, ':/children?$select=name&$top=999'), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) fail(`kunde inte lista orderkön (HTTP ${res.status}).`);
  const namn = ((await res.json()).value ?? []).map((v) => v.name).filter((n) => /^order-\d{4}\.json$/.test(n)).sort();
  const ordrar = [];
  for (const n of namn) {
    const text = await lasFil(token, `${ORDERMAPP}/${n}`);
    if (text) ordrar.push(JSON.parse(text));
  }
  return ordrar;
}

export const skrivOrder = (token, order) =>
  skrivFil(token, `${ORDERMAPP}/${orderfil(order.nr)}`, JSON.stringify(order, null, 2) + '\n');
