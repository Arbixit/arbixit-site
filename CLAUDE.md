# arbixit-site

Läs `PROJECT.md` – där finns läget, strukturen och nästa steg. Mandatmodellen
(grönt/gult/rött) styr allt arbete:

- **Grönt (kör själv):** pusslet följer Arbixit-dashboardens "Aktiva projekt"
  och deployas automatiskt efter gröna tester (`pusselsynk.yml`, beslut
  Magnus 2026-11-15). Redigera aldrig app-listan i `index.html` för hand –
  den genereras av `scripts/build-apps.mjs`.
- **Gult (utkast först):** nya sajttexter och andra publika texter. Godkänns
  av Magnus eller Pierre.
- **Rött (endast Magnus/Pierre):** DNS, domän, konton, behörigheter.

Repot är **publikt**: inga hemligheter, inga stage-adresser, inga kundnamn
och inga mejladresser i filer. `design/` är designunderlag – integrera inte
utan beslut.
