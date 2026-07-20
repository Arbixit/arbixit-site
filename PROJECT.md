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

- `index.html` är **embryot** – den levererade mockupen ur arbetsprovet
  ("2026-07-18 arbixit-se mockup.html"), med favicon tillagd. App-datan är
  hårdkodad; koppling till apps.json är nästa steg.
- `design/` innehåller **designunderlaget** `design_handoff_arbixit_pussel`
  (high-fidelity-prototyp med designsystemet Organic, se `design/INSTRUKTION.md`).
  Incheckat som referens – **inte integrerat, inte deployat.**
- CI kör test vid push/PR. **Ingen deploy** – Pages aktiveras först efter
  godkännande.
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
| `index.html` | Sajt-embryot: pussel-zoom, panel, grafisk profil, WCAG-grund (skip-länk, fokus, reduced motion, noscript). |
| `assets/favicon.svg` | Favicon ur huvudpusselbiten. PNG/touch-ikoner kommer med brand-repots PNG-export. |
| `design/` | Designunderlag, orört. Startfil `Arbixit Pussel.dc.html`. |
| `test/` | Sajtkontroller (`npm test`): grundkrav, tillgänglighet, profilfärger, kantprofil, inga hemligheter, brevbärarens filer. |
| `scripts/` | Brevbäraren: `graph.mjs` (auth-hjälpare), `mail-check.mjs` (deterministisk koll + loopskydd), `mail-act.mjs` (svar, läst-markering, mejllogg till SharePoint). |

`piecePath` i index.html har sin kanoniska källa i
`arbixit-brand/generator/piece.js` – ändra där först.

## Nästa steg

1. Sajt v1: integrera designunderlaget i `design/` (eller besluta väg A/B
   enligt `design/INSTRUKTION.md`) – mål fredag 31 juli enligt avtalet B9.
2. Bygg pusslet från `apps.json` i stället för hårdkodad app-data
   (repository_dispatch + daglig cron enligt tekniska arbetsupplägget).
3. Lighthouse-, axe- och länkkontroll i CI före deploy-steget.
4. Pages-preview + DNS-underlag till Magnus; livesättning efter godkännande.
