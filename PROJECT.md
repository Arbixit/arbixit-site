---
author: magnus@tqvist.se
uppdaterad: 2026-07-20
---

# arbixit-site

Webbplatsen arbixit.se – statisk sajt som på sikt bygger sig själv från
GitHub-dashboarden via `arbixit-brand/manifest/apps.json`. Publikt repo,
tänkt host: GitHub Pages (DNS via Loopia pekas av Magnus – rött beslut).
Styrdokument: "2026-07-18 Arbixit tekniskt arbetsupplägg", onboarding-
och behörighetsavtalet samt mandatmodell v1 (godkänd 2026-07-20).

## Läge just nu

- **`index.html` är designprototypen** – livesatt 2026-07-21 enligt
  INSTRUKTION.md väg A (godkänt av Magnus i chatt). Prototypens filer
  (`support.js`, `arbixit-logo.svg`, `icons/`, `_ds/`) ligger kopierade i
  roten; endast head-metadata (lang, titel, beskrivning, favicon) är
  tillagd, designen orörd. Header-loggan `arbore_blackwhite-mrrh4uun-sswu.png`
  hämtad ur "01 Grafisk profil/Arbixit pussel mockup hemsida.zip"
  (`arbore-sf-sv.svg` fanns inte i något åtkomligt underlag – byt in när
  den dyker upp).
- `motor/index.html` är **mockup-embryot** (arbetsprovets sajt) – behållet
  för vidareutvecklingen: app-datan ska på sikt byggas från
  `arbixit-brand/manifest/apps.json`.
- `design/` innehåller **designunderlaget** orört, som referens.
- CI kör test vid push/PR. **GitHub Pages deployar main** (aktiverad
  2026-07-21); `CNAME` pekar www.arbixit.se – DNS pekas av Magnus (rött).
- **Brevbäraren** (`.github/workflows/brevbararen.yml`) bevakar Arbixits
  delade Claude-postlåda (adressen ligger i Actions-secreten `MAIL_MAILBOX`).
  Den bor i detta publika repo eftersom Actions-minuter är kostnadsfria i
  publika repon – pollningen kör var 30:e minut (~1 500 körningar/månad) och
  skulle ensam äta upp privata kontots fria kvot. Kollsteget är helt
  deterministiskt (`scripts/mail-check.mjs`, inga AI-anrop); AI-steget körs
  endast vid ny post, får inga hemligheter och skriver bara åtgärdsfiler.
  Svar/loggning sker deterministiskt (`scripts/mail-act.mjs`): svar alltid
  via Graph "reply" (mottagare kan inte väljas av AI), fast signatur, max
  5 svar per körning, loopskydd mot egna svar och no-reply, allt loggas
  till 00 Styrning. Dubblettskydd: hanterade mejl bokförs som markörer i
  mejlloggen innan svar skickas – nödvändigt eftersom appen saknar
  Mail.ReadWrite (läst-markering är bäst-möjliga-försök tills den
  behörigheten beviljas). Styrs av "Mejlpolicy för digital medarbetare"
  (05 For approval).

## Struktur

| Sökväg | Innehåll |
|---|---|
| `index.html` + `support.js`, `arbixit-logo.svg`, `icons/`, `_ds/` | Startsidan: designprototypen (Organic-designsystemet), livesatt via Pages. |
| `CNAME` | www.arbixit.se – Pages custom domain (DNS pekas av Magnus). |
| `motor/index.html` | Sajt-embryot från arbetsprovet: pussel-zoom, panel, grafisk profil, WCAG-grund. Bas för apps.json-motorn. |
| `assets/favicon.svg` | Favicon ur huvudpusselbiten. PNG/touch-ikoner kommer med brand-repots PNG-export. |
| `design/` | Designunderlag, orört. Startfil `Arbixit Pussel.dc.html`. |
| `test/` | Sajtkontroller (`npm test`): grundkrav, tillgänglighet, profilfärger, kantprofil, inga hemligheter, brevbärarens filer. |
| `scripts/` | Brevbäraren: `graph.mjs` (auth-hjälpare), `mail-check.mjs` (deterministisk koll + loopskydd), `mail-act.mjs` (svar, läst-markering, mejllogg till SharePoint). |

`piecePath` i motor/index.html har sin kanoniska källa i
`arbixit-brand/generator/piece.js` – ändra där först.

## Nästa steg

1. [M] Peka DNS för www.arbixit.se mot GitHub Pages (CNAME →
   arbixit.github.io); HTTPS slår på automatiskt efteråt.
2. Byt in `arbore-sf-sv.svg` som header-logga när filen finns i underlaget.
3. Ersätt prototypens platshållartexter/-länkar per app och lägg ikoner för
   crm, fineprint, postiljon, rocketchat, showroom (se design/INSTRUKTION.md).
4. Bygg pusslet från `apps.json` i stället för hårdkodad app-data
   (repository_dispatch + daglig cron enligt tekniska arbetsupplägget) –
   utveckling sker i `motor/`.
5. Lighthouse-, axe- och länkkontroll i CI.
