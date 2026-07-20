# Instruktion: publicera Arbixit Pussel-hemsidan på www.arbixit.se

## Vad detta är
Denna mapp innehåller en färdig **designprototyp** av Arbixits pussel-hemsida, byggd i HTML.
Startfilen är `Arbixit Pussel.dc.html` (en "Design Component"). Den läser in:
- `support.js` — runtime som renderar komponenten (obligatorisk)
- `arbixit-logo.svg` — logotypen i mitten (mörkt trädmärke)
- `icons/` — app-ikoner (PNG). Finns just nu: `planttools.png`, `citadel.png`, `tasks.png`
- `_ds/…` — designsystemet "Organic" (stylesheet + bundle), som filen länkar till

Prototypen är **high-fidelity**: färger, typografi, layout och interaktioner (klicka på en
pusselbit → zoom + detaljpanel, språkväxling SV/EN, grid-/radial-layout) är slutgiltiga.

## Uppgift
Publicera hemsidan på `www.arbixit.se`. Två vägar:

**A. Snabbast — deploya prototypen som den är.**
`Arbixit Pussel.dc.html` fungerar direkt i webbläsaren så länge de relativa sökvägarna
(`support.js`, `arbixit-logo.svg`, `icons/`, `_ds/…`) ligger kvar bredvid den. Döp ev. om
filen till `index.html`, lägg hela mappen på webbservern/statisk host (t.ex. Netlify, Vercel,
S3, Nginx) och peka `www.arbixit.se` dit. Ingen byggprocess krävs.

**B. Rekommenderat på sikt — bygg om i riktig kodbas.**
Om Arbixit har (eller vill ha) en riktig frontend (React/Next/Vue etc.), återskapa designen
där med kodbasens egna mönster. HTML-filen är då en **referens**, inte kod att kopiera rakt av.
Bevara:
- Designsystemet Organic (tokens i `_ds/.../styles.css` — färger `var(--color-*)`, typsnitt
  Caprasimo/Figtree, radier).
- Interaktionerna: klick-zoom på pusselbitar, detaljpanel (stäng med Esc/×), språkväxling,
  layoutläge.
- App-datan (namn, miljö-status stage/prod, beskrivning, features, länk) — ligger i
  logikklassen i `Arbixit Pussel.dc.html`.

## App-ikoner
Ikoner visas som avatar i pusselbiten och i detaljpanelen. Kopplingen sker i `ICONS`-objektet
i `Arbixit Pussel.dc.html` (i logikklassen), t.ex.:

```js
const ICONS = {
  planttools: 'icons/planttools.png',
  citadel:    'icons/citadel.png',
  tasks:      'icons/tasks.png',
  // crm, fineprint, postiljon, rocketchat, showroom — saknar ikon (visar initialer)
};
```

Appar utan ikon visar automatiskt sina initialer som fallback. För att lägga till en ikon:
lägg filen i `icons/` (SVG eller PNG, gärna ≥256 px) och lägg till raden med rätt app-id.

## Att göra innan lansering
- Ersätt platshållar-beskrivningarna för apparna med riktig text.
- Lägg till ikoner för resterande appar (crm, fineprint, postiljon, rocketchat, showroom).
- Sätt riktiga länkar per app.
- Konfigurera domän + HTTPS på `www.arbixit.se`.

## Filer
- `Arbixit Pussel.dc.html` — hela sidan (layout + logik + app-data + ICONS-mappning)
- `support.js` — runtime
- `arbixit-logo.svg` — logotyp
- `icons/` — app-ikoner
- `_ds/` — Organic designsystem
