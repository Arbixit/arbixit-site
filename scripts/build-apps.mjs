#!/usr/bin/env node
// Pusslets datakedja: Arbixit-dashboardens "Aktiva projekt" -> data/apps.json
// -> den genererade app-listan i index.html.
//
//   node scripts/build-apps.mjs          bygger om index.html ur data/apps.json
//   node scripts/build-apps.mjs --sync   hämtar först läget från dashboardens
//                                        källa och skriver data/apps.json
//
// Källan är _PLATTFORM/config/apps.json – samma fil som dashboardens tabell
// "Aktiva projekt" genereras ur. --sync kräver gh med läsrätt där (lokal
// gh-auth, eller PLATFORM_READ_TOKEN som GH_TOKEN i Actions).
//
// Detta repo är PUBLIKT. Därför skrivs bara det som ändå syns på sajten till
// data/apps.json: namn, status och – för appar i prod – länken. Miljötexter,
// stage-adresser, kundboxar och appar utanför plattformen lämnar aldrig
// källan.
//
// Vilka appar syns (beslut Magnus 2026-11-15):
//   prod  + delad plattform (platform1)  -> aktiv pusselbit, automatiskt
//   prod  + egen instans (kundbox)       -> bara om den finns i editorial.json
//   stage                                -> "på väg"-bit, bara om den finns i
//                                           editorial.json
//   none, eller "public": false          -> visas aldrig

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(root, 'data', 'apps.json');
const EDITORIAL = join(root, 'data', 'editorial.json');
const INDEX = join(root, 'index.html');

export const MAX_BITAR = 8; // pusslet har åtta platser runt mittbiten
export const KALLA = 'Arbixit-dashboarden, tabellen Aktiva projekt';

const START = '/* APPS:START – genererat av scripts/build-apps.mjs, redigera inte för hand */';
const SLUT = '/* APPS:END */';
const NS_START = '<!-- APPS-NOSCRIPT:START – genererat av scripts/build-apps.mjs -->';
const NS_SLUT = '<!-- APPS-NOSCRIPT:END -->';

/** Väljer ut och tvättar de appar som får synas publikt. */
export function publikaAppar(plattformsappar, editorial) {
  const ut = [];
  for (const app of plattformsappar) {
    const ed = editorial[app.name];
    if (ed?.public === false) continue;
    if (app.status === 'prod') {
      if (!ed && app.platform !== 'platform1') continue;
      if (!/^https:\/\/[a-z0-9.-]+(\/[^\s"<>]*)?$/i.test(app.link ?? '')) {
        throw new Error(`appen ${app.name} är i prod men saknar giltig https-länk`);
      }
      ut.push({ name: app.name, status: 'prod', url: app.link });
    } else if (app.status === 'stage') {
      if (!ed) continue;
      ut.push({ name: app.name, status: 'stage' });
    }
  }
  // Prod först, därefter "på väg" – inbördes i dashboardens ordning.
  const sorterade = [...ut.filter((a) => a.status === 'prod'), ...ut.filter((a) => a.status === 'stage')];
  return { appar: sorterade.slice(0, MAX_BITAR), overtaliga: sorterade.slice(MAX_BITAR).map((a) => a.name) };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
const mono = (s) => {
  const ord = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const m = ord.length > 1 ? ord[0][0] + ord[1][0] : (ord[0] ?? 'Ap').slice(0, 2);
  return m[0].toUpperCase() + (m[1] ?? '').toLowerCase();
};
const LEDIGA_HUES = [215, 330, 110, 20, 270, 170, 50, 300];

/** Slår ihop publik app-data med det redaktionella lagret till sajtens app-lista. */
export function sajtAppar(appar, editorial) {
  const anvanda = new Set(Object.values(editorial).map((e) => e.hue));
  const lediga = LEDIGA_HUES.filter((h) => !anvanda.has(h));
  let n = 0;
  return appar.map((app) => {
    const ed = editorial[app.name];
    const bas = ed
      ? { id: ed.id, hue: ed.hue, mono: ed.mono, name: ed.name, tag: ed.tag, blurb: ed.blurb, features: ed.features }
      : {
          // Ny app i prod som ännu saknar redaktionell text: biten går ut
          // direkt med neutral text; riktig text är gult flöde.
          id: slug(app.name),
          hue: lediga[n++ % Math.max(lediga.length, 1)] ?? 215,
          mono: mono(app.name),
          name: app.name,
          tag: { sv: 'Ny app', en: 'New app' },
          blurb: { sv: 'Ny app på Arbixit-plattformen. Mer information kommer snart.', en: 'A new app on the Arbixit platform. More information coming soon.' },
          features: { sv: [], en: [] },
        };
    return { ...bas, env: app.status, url: app.url ?? '', icon: ed?.icon ?? '' };
  });
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function appBlock(sajtappar) {
  // "<" escapas så att blocket aldrig kan avsluta script-elementet det ligger i.
  const json = JSON.stringify(sajtappar, null, 2).replace(/</g, '\\u003c');
  return `${START}\n    const APPS = ${json.replace(/\n/g, '\n    ')};\n    ${SLUT}`;
}

export function noscriptBlock(sajtappar) {
  const rader = sajtappar.map((a) =>
    a.env === 'prod'
      ? `    <li><a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a> – ${escapeHtml(a.tag.sv)}</li>`
      : `    <li>${escapeHtml(a.name)} – ${escapeHtml(a.tag.sv)} (på väg)</li>`,
  );
  return `${NS_START}\n<noscript>\n  <h1>Arbixit – ett pussel av appar</h1>\n  <ul>\n${rader.join('\n')}\n  </ul>\n</noscript>\n${NS_SLUT}`;
}

function ersatt(html, start, slut, nytt) {
  const a = html.indexOf(start);
  const b = html.indexOf(slut);
  if (a === -1 || b === -1 || b < a) throw new Error(`markörerna ${start.slice(0, 22)}… saknas i index.html`);
  return html.slice(0, a) + nytt + html.slice(b + slut.length);
}

/** Returnerar index.html med de genererade blocken utbytta. */
export function byggIndex(html, sajtappar) {
  return ersatt(ersatt(html, START, SLUT, appBlock(sajtappar)), NS_START, NS_SLUT, noscriptBlock(sajtappar));
}

export const lasEditorial = () => JSON.parse(readFileSync(EDITORIAL, 'utf8')).apps;
export const lasData = () => JSON.parse(readFileSync(DATA, 'utf8'));

function hamtaPlattformsappar() {
  const raw = execFileSync(
    'gh',
    ['api', 'repos/Arbixit/_PLATTFORM/contents/config/apps.json', '-H', 'Accept: application/vnd.github.raw+json'],
    { encoding: 'utf8' },
  );
  const appar = JSON.parse(raw).apps;
  if (!Array.isArray(appar) || appar.length === 0) {
    throw new Error('källan gav 0 appar – data/apps.json lämnas orörd');
  }
  return appar;
}

function main() {
  const editorial = lasEditorial();
  if (process.argv.includes('--sync')) {
    const { appar, overtaliga } = publikaAppar(hamtaPlattformsappar(), editorial);
    if (appar.length === 0) throw new Error('0 publika appar efter urval – data/apps.json lämnas orörd');
    if (overtaliga.length > 0) {
      console.log(`::warning::Fler än ${MAX_BITAR} publika appar – får inte plats i pusslet: ${overtaliga.join(', ')}`);
    }
    const ny = { source: KALLA, apps: appar };
    const nyText = JSON.stringify(ny, null, 2) + '\n';
    let gammal = '';
    try { gammal = readFileSync(DATA, 'utf8'); } catch { /* första körningen */ }
    if (nyText === gammal) {
      console.log(`data/apps.json oförändrad – ${appar.length} appar`);
    } else {
      writeFileSync(DATA, nyText);
      console.log(`skrev data/apps.json – ${appar.length} appar`);
    }
  }
  const sajtappar = sajtAppar(lasData().apps, editorial);
  const html = readFileSync(INDEX, 'utf8');
  const nyHtml = byggIndex(html, sajtappar);
  if (nyHtml === html) {
    console.log('index.html oförändrad');
  } else {
    writeFileSync(INDEX, nyHtml);
    console.log(`byggde om pusslet i index.html – ${sajtappar.length} bitar`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    console.error(`build-apps: ${e.message}`);
    process.exit(1);
  }
}
