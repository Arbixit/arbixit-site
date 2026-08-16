---
author: magnus@tqvist.se
uppdaterad: 2026-08-16
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
- **`terms/` och `privacy/`** är användarvillkoren och integritetspolicyn,
  live på https://www.arbixit.se/terms/ och /privacy/ (2026-08-16). Krävs för
  Entra-registreringen "Arbixit Task - M365 Connector" och för Microsofts
  publisher verification. Statisk HTML med båda språken i dokumentet;
  `legal.css` + `legal.js` delas av sidorna och `legal.js` sköter SV/EN-
  växlingen (`?lang=en`, localStorage, faller tillbaka på webbläsarspråk).
  Utan JS visas svenska – engelska ligger bakom `hidden`, så båda versionerna
  är indexerbara. Integritetspolicyn beskriver den **verkliga** integrationen
  enligt `_PLATTFORM/config/microsoft365.json` och
  `_PLATTFORM/docs/runbooks/MICROSOFT_365_INTEGRATION.md`: app-only client
  credentials, noll application permissions i Entra (endast `User.Read`
  delegerat), brevlådeåtkomst via Exchange Application RBAC scopad till en
  brevlåda, inga refresh-tokens, gallring 30 dagar som standard, drift i
  `eu-north-1`, AI-triage mot Anthropic/OpenAI som frivilligt underbiträde.
  **Ändras integrationen måste policyn ändras med den.**
- `design/` innehåller **designunderlaget** orört, som referens.
- CI kör test vid push/PR. **GitHub Pages deployar main** (aktiverad
  2026-07-21); `CNAME` pekar www.arbixit.se.
- **HTTPS är live sedan 2026-08-16.** DNS var redan rätt (CNAME www →
  arbixit.github.io, A-poster på apex), men GitHub hade aldrig begärt något
  Let's Encrypt-cert – Pages-API:t saknade `https_certificate` helt och
  serverade fallback-certet `*.github.io`. Att sätta om samma CNAME via API:t
  räckte inte; **fixen var att nolla `cname` och sätta tillbaka den** (två
  separata PUT), varefter certet utfärdades inom minuter och täcker både
  `www.arbixit.se` och apex `arbixit.se` (giltigt t.o.m. 2026-11-14).
  `https_enforced` är på. Fallgropar: skicka aldrig `https_enforced` i samma
  anrop som återkopplingen – API:t svarar 404 "The certificate does not exist
  yet"; och GitHub commitar själv `Delete CNAME`/`Create CNAME` i repot under
  bytet, så **hämta hem innan du pushar**. Domänen ligger nere ca 3 minuter
  medan `cname` är null.
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
| `index.html` + `support.js`, `arbixit-logo.svg`, `icons/`, `_ds/` | Startsidan: designprototypen (Organic-designsystemet), livesatt via Pages. Footern länkar till villkor och policy. |
| `terms/`, `privacy/` | Användarvillkor och integritetspolicy, SV+EN i samma dokument. |
| `legal.css`, `legal.js` | Delad stil och SV/EN-växling för de juridiska sidorna. |
| `CNAME` | www.arbixit.se – Pages custom domain. HTTPS aktivt (Let's Encrypt). |
| `motor/index.html` | Sajt-embryot från arbetsprovet: pussel-zoom, panel, grafisk profil, WCAG-grund. Bas för apps.json-motorn. |
| `assets/favicon.svg` | Favicon ur huvudpusselbiten. PNG/touch-ikoner kommer med brand-repots PNG-export. |
| `design/` | Designunderlag, orört. Startfil `Arbixit Pussel.dc.html`. |
| `test/` | Sajtkontroller (`npm test`): grundkrav, tillgänglighet, profilfärger, kantprofil, inga hemligheter, brevbärarens filer. |
| `scripts/` | Brevbäraren: `graph.mjs` (auth-hjälpare), `mail-check.mjs` (deterministisk koll + loopskydd), `mail-act.mjs` (svar, läst-markering, mejllogg till SharePoint). |

`piecePath` i motor/index.html har sin kanoniska källa i
`arbixit-brand/generator/piece.js` – ändra där först.

## Nästa steg

1. [M] Slutför Entra-registreringen "Arbixit Task - M365 Connector": ladda upp
   `arbixit-brand/dist/arbixit-task-m365-215.png` som applogotyp, sätt
   Hemside-URL `https://www.arbixit.se/`, URL för tjänstvillkor
   `https://www.arbixit.se/terms/` och sekretesspolicy
   `https://www.arbixit.se/privacy/`.
2. Byt in `arbore-sf-sv.svg` som header-logga när filen finns i underlaget.
3. Ersätt prototypens platshållartexter/-länkar per app och lägg ikoner för
   crm, fineprint, postiljon, rocketchat, showroom (se design/INSTRUKTION.md).
4. Bygg pusslet från `apps.json` i stället för hårdkodad app-data
   (repository_dispatch + daglig cron enligt tekniska arbetsupplägget) –
   utveckling sker i `motor/`.
5. Lighthouse-, axe- och länkkontroll i CI.
