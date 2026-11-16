---
author: magnus@tqvist.se
uppdaterad: 2026-11-15
---

# arbixit-site

Webbplatsen arbixit.se – statisk sajt som på sikt bygger sig själv från
GitHub-dashboarden via `arbixit-brand/manifest/apps.json`. Publikt repo,
tänkt host: GitHub Pages (DNS via Loopia pekas av Magnus – rött beslut).
Styrdokument: "2026-07-18 Arbixit tekniskt arbetsupplägg", onboarding-
och behörighetsavtalet samt mandatmodell v1 (godkänd 2026-07-20).

## Läge just nu

- **Pusslet följer dashboarden (sedan 2026-11-15).** App-listan i
  `index.html` är inte längre hårdkodad utan genereras av
  `scripts/build-apps.mjs`:

  ```
  _PLATTFORM/config/apps.json   källan bakom dashboardens "Aktiva projekt"
        │  --sync (urval + tvätt, se nedan)
        ▼
  data/apps.json                publikt: namn, status, prod-länk
        │  + data/editorial.json (visningsnamn, färg, ikon, texter)
        ▼
  index.html                    blocket mellan APPS:START/APPS:END + noscript
  ```

  **Urval** (beslut Magnus 2026-11-15): prod på delade plattformen
  (`platform1`) blir aktiv bit automatiskt, även helt nya appar – de får
  neutral text tills riktig text godkänts (gult flöde). Prod på egen instans
  (kundboxar) visas bara om appen finns i `data/editorial.json`. Stage visas
  som nedtonad "på väg"-bit utan länk, och bara om appen finns i
  `data/editorial.json`. Status `none` och `"public": false` visas aldrig.
  Lediga platser (pusslet har åtta runt mittbiten) ritas som streckade
  "Ledig plats"-bitar. Blir de publika apparna fler än åtta varnar synken
  och visar de åtta första (prod före stage) – då behöver layouten byggas ut.

  **Publikt repo:** stage-adresser, miljötexter, kundboxar och appar utanför
  plattformen skrivs aldrig hit; `data/apps.json` innehåller bara det som
  ändå syns på sajten.

  **Drift:** `.github/workflows/pusselsynk.yml` kör varje timme: synk →
  test → commit vid diff → Pages deployar. Grönt flöde enligt
  mandatmodellen – ingen handpåläggning. Kräver secreten
  `PLATFORM_READ_TOKEN` (fine-grained PAT, Contents: read på enbart
  `Arbixit/_PLATTFORM`); saknas den hoppas synken över med en varning.
  Lokalt: `node scripts/build-apps.mjs --sync` (använder din gh-inloggning).
- **Arbetsorder via mejl (sedan 2026-11-15, försiktiga varianten).** Mejl
  från uppdragsgivarna blir arbetsorder. Detta repo har två deterministiska
  delar av kedjan; själva arbetet görs av arbetspasset i det privata repot
  `arbixit-brand`, där hela flödet beskrivs.
  - **Intag** (`scripts/mail-check.mjs` + `scripts/order.mjs`): ett mejl är en
    order bara om avsändaren står i secreten `ORDER_SENDERS` OCH Exchange
    intygar att mejlet är internt (`X-MS-Exchange-Organization-AuthAs:
    Internal`). Ordern sparas i SharePoint (00 Styrning/Arbetsorder) och får
    ett kvitto. Ordermejl når aldrig AI-steget här, och innehållet skrivs
    inte till disk. Ett svar "ok" på ett granskningsmejl sätter ordern till
    godkänd; allt annat svar gör att ordern görs om. Bilder i mejlet
    (bifogade eller inklistrade; png, jpg, gif, webp; högst 6 per mejl och
    4 MB styck) sparas bredvid ordern så att arbetspasset ser dem.
  - **Svar på utkastnotiser.** När utkast läggs i 05 For approval mejlar
    biblioteket en notis per fil (ett flöde hos Microsoft, inte kod i våra
    repon). Ett svar på en sådan notis ligger i notisens tråd, inte i
    orderns. Bär en order i läget `session` utkastets mapp- eller filnamn i
    fältet `utkast` kopplas svaret dit: "godkänt" ger läget `sessionklar`,
    annat bokförs som kommentar. Pekas ingen eller flera order ut blir
    svaret en vanlig ny order, som förut.
  - **Direktstart (sedan 2026-11-16).** GitHubs schema visade sig gå var
    3:e–7:e timme i stället för var 30:e minut. Brevbärarens sista steg
    startar därför nästa led själv: arbetspasset i `arbixit-brand` när en
    order kommit in eller ska göras om, och pusselsynken när en order
    godkänts. Att starta arbetspasset kräver secreten `DISPATCH_TOKEN`
    (fine-grained PAT, Actions: read and write på enbart `arbixit-site` och
    `arbixit-brand`); saknas den går arbetspasset på sitt schema.
    Brevbäraren själv startas utifrån när ett mejl kommer (flöde hos
    Microsoft, se PROJECT.md i `arbixit-brand`). Schemat ligger kvar som
    reserv.
  - **Publicering** (`scripts/order-verkstall.mjs`, sista steget i
    pusselsynken): godkända order appliceras som patch, efter att
    spärrlistan och testerna kontrollerats en gång till. Bara patchens egna
    filer committas. Passar patchen inte längre görs ordern om.
  - **Spärrat för arbetsorder:** `.github/`, `scripts/`, `test/`, `terms/`,
    `privacy/`, `CNAME`, `CLAUDE.md`, `package.json`, `data/apps.json`,
    designsystemet och `design/`/`motor/`.
  - Inga adresser, ordertexter eller kundnamn får hamna i detta repo eller i
    Actions-loggarna – skripten loggar bara antal.
- **Keepalive.** GitHub stänger av schemalagda workflows efter 60 dagar utan
  aktivitet i repot – det hände brevbäraren 2026-10-16 och ingen märkte det
  på en månad. Pusselsynkens sista steg återaktiverar därför repots
  schemalagda workflows varje körning.
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
  publika repon – pollningen är inställd på var 30:e minut (i praktiken går
  GitHubs schema betydligt glesare, se Direktstart ovan) och
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
  (v3, godkänd 2026-11-15, i 00 Styrning). Mejl från uppdragsgivarna blir
  arbetsorder (se nedan); övriga mejl besvaras som förut.

## Struktur

| Sökväg | Innehåll |
|---|---|
| `index.html` + `support.js`, `arbixit-logo.svg`, `icons/`, `_ds/` | Startsidan: designprototypen (Organic-designsystemet), livesatt via Pages. App-listan är genererad – redigera den inte för hand. Footern länkar till villkor och policy. |
| `data/apps.json` | Publik app-data (namn, status, prod-länk), skriven av `build-apps.mjs --sync`. |
| `data/editorial.json` | Redaktionellt lager per app: visningsnamn, färg, initialer, ikon, texter, ev. `"public": false`. |
| `terms/`, `privacy/` | Användarvillkor och integritetspolicy, SV+EN i samma dokument. |
| `legal.css`, `legal.js` | Delad stil och SV/EN-växling för de juridiska sidorna. |
| `CNAME` | www.arbixit.se – Pages custom domain. HTTPS aktivt (Let's Encrypt). |
| `motor/index.html` | Sajt-embryot från arbetsprovet: pussel-zoom, panel, grafisk profil, WCAG-grund. Bas för apps.json-motorn. |
| `assets/favicon.svg` | Favicon ur huvudpusselbiten. PNG/touch-ikoner kommer med brand-repots PNG-export. |
| `design/` | Designunderlag, orört. Startfil `Arbixit Pussel.dc.html`. |
| `scripts/order.mjs`, `scripts/order-verkstall.mjs` | Arbetsorder: intagets regler och kö, samt publicering av godkända order. |
| `test/` | Sajtkontroller (`npm test`): grundkrav, tillgänglighet, profilfärger, kantprofil, inga hemligheter, brevbärarens filer, pusslets datakedja och urvalsregler, arbetsorderns regler. |
| `scripts/` | Brevbäraren: `graph.mjs` (auth-hjälpare), `mail-check.mjs` (deterministisk koll + loopskydd), `mail-act.mjs` (svar, läst-markering, mejllogg till SharePoint). |

`piecePath` i motor/index.html har sin kanoniska källa i
`arbixit-brand/generator/piece.js` – ändra där först.

## Nästa steg

1. Villkors- och policysidorna gäller **hela Arbixit**, inte bara Task – peka
   kommande app-registreringar (CRM, Postiljon, Citadel) på samma URL:er:
   `https://www.arbixit.se/terms/` och `https://www.arbixit.se/privacy/`,
   med avslutande snedstreck (Microsofts form, och det registret dokumenterar).
   Task-registreringen är klar sedan 2026-08-16.
2. Byt in `arbore-sf-sv.svg` som header-logga när filen finns i underlaget.
3. Ersätt prototypens platshållartexter per app i `data/editorial.json`
   (gult flöde – utkast till 05 For approval). Länkarna är klara: de kommer
   från dashboarden. Ikoner för crm, fineprint och postiljon lades in
   2026-11-16 (arbetsorder 3, godkänd per mejl): pusselbit i appens färg med
   vit glyf, genererade ur ikonmallen i det privata profilrepot. Fineprints
   violetta är provisorisk tills brandboken låser paletten.
4. Lighthouse-, axe- och länkkontroll i CI.
5. Bygg ut layouten när de publika apparna blir fler än åtta.
