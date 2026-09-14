# Davar

<p align="center">
  <img src="design/davar_blue.png" alt="Davar logo" width="180" />
</p>

A minimalist Bible study app focused on Hebrew Scriptures.

## URL

- https://davar.bible

<p align="center">
  <a href="https://play.google.com/store/apps/details?id=bible.davar">
    <img src="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png" alt="Get it on Google Play" height="64" />
  </a>
  <a href="https://www.apple.com/app-store/">
    <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Download on the App Store" height="64" />
  </a>
</p>

## Run Locally

### Requirements

- Bun installed

### 1) Clone and install

```bash
git clone https://github.com/jhonnyisaacc/davar.git
cd davar
```

### 2) Web app

```bash
cd web
bun install
bun dev
```

Local web URL:
- http://localhost:3002

### 3) Mobile app (Expo)

```bash
cd mobile
bun install
bun expo start
```

## Project Structure

- web: Web app
- mobile: Mobile app (Expo)
- data: Source datasets and generated JSON
- scripts: Data processing and utility scripts

## Acknowledgements & Data Sources

Data in this project comes from public-domain, permissive, and licensed sources.

- Open Scriptures Hebrew Bible Project (morphology): https://github.com/openscriptures/morphhb
- Open Scriptures Hebrew Lexicon: https://github.com/openscriptures/HebrewLexicon
- Hebrew Bible source repository: https://github.com/hebrew-bible/hebrew-bible.github.io
- SPABES (AudioBiblia.org / Irma Flores): https://ebible.org/spabes/
- Delitzsch Strong's initial reference mapping source: https://www.ph4.org/b4_1.php?l=iw
- Qumran differences/data reference: https://codeberg.org/dandeto/deadseainsights
- SBL Hebrew font source: https://www.sbl-site.org/educational/BiblicalFonts_SBLHebrew.aspx
- Google Fonts: https://fonts.google.com

Licensed translation credits used by permission:

- TS2009 (Institute for Scripture Research):
  "Scripture taken from The Scriptures, Copyright by Institute for Scripture Research. Used by permission."
- TTH (Natanael Doldan):
  "Texto tomado de la Traducción Textual del Hebreo, Copyright por Natanael Doldan. Usado con permiso."

Special thanks:

- Natanael Doldan for the Davar logo.
- Adi Greenberg for developing the Hebrew Dead Sea Scroll font.
- Moriah Betzalel for consultation on Dead Sea Scroll Hebrew readability.

For full legal/source details and restrictions, see:
- docs/terms.md
- locales/legalContent.ts
- web/ATTRIBUTIONS.md

## License

This repository contains both code and content with attribution and licensing requirements. See:
- web/ATTRIBUTIONS.md
