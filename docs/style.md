# Interface style

Web and mobile share one reading surface. This file describes that surface as it is. Hebrew interface language is right to left. A change to interface wording lands in English, Spanish, and Hebrew together. The layout stays neumorphic and contemplative: warm paper, soft depth, and a quiet reading column.

## Reading

The default screen is one verse, centered. Hebrew scripture is large. The translation sits under it when Hebrew-only mode is off. Full chapter stacks the verses of the chapter. Sefer style runs them as one continuous text, and it is available with Hebrew only or translation only. A word opens the word card. Swipe moves to the previous or next verse. The calendar day pill can sit above the verse.

Greek Besorah text, when that source is selected, uses the same column and is left to right. Qumran wording uses the Dead Sea Scrolls face and the copper color.

## Color

Light is warm parchment. Dark is a deep warm brown. The reader chooses light or dark in settings. Tekhelet is the accent for controls and the active state. Copper marks Qumran text, the selected word, word hover, and prose links.

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#faf6f0` | `#3c3836` |
| Surface | `#fdf8f2` | `#3c3836` |
| Raised surface | `#f4eee7` | `#44403e` |
| Text | `#000000` | `#faf4e6` |
| Secondary text | `#707070` | `#a89a7f` |
| Hebrew text | `#000000` | `#d5c4a1` |
| Accent | `#7aa0d6` | `#92b5e8` |
| Accent pressed | `#4c72a8` | `#4c72a8` |
| Accent fill | `#a8c8f0` | `#bcd8ff` |
| Copper | `#b07a3c` | `#a06c35` |
| Copper highlight and Qumran | `#c68f55` | `#b5814a` |

The navigation track behind the pills is `#e7e7e7` in light and `#454545` in dark. A selected word is a copper wash, `rgba(198, 143, 85, 0.28)`, with a soft copper ring. Focus on a word uses that same copper. Focus on a control uses the accent.

## Depth

Cards and the navigation bar sit on the page with two shadows: a dark shadow down and to one side, and a light highlight opposite it. The surface color matches the page, so the depth reads as soft relief rather than a floating panel.

Raised cards use a 16px radius, a hairline border, and shadows of about `6px 6px 16px` and `-6px -6px 16px`. The inset form reverses those shadows. The navigation bar uses the same pair at `6px 6px 12px`. Smaller controls, such as the calendar day control, use `3px 3px 6px`. Pills and switches are fully rounded. The base radius is `0.75rem`.

Hover on a raised card eases the shadow in and scales the card to `1.02` over 300ms. Glass blur is for dropdown panels.

Web shadow colors are the warm pairs in `web/src/styles/theme.css`. Mobile uses the pairs in `mobile/src/theme.ts`, and on iOS the horizontal shadow offset flips when the interface is right to left. Each surface keeps its own shadow pair.

## Type

| Role | Face | Where it appears |
| --- | --- | --- |
| Interface | Inter | Chrome, settings, translation under a verse |
| Wordmark and Hebrew book names | Suez One | The דבר mark and Hebrew names in the book list |
| Scripture | Cardo | Hebrew and Greek verse text |
| Qumran | Dead Sea Scrolls, then Cardo | Variant wording |
| Assemblies headings | Manrope, then Inter | Assemblies entry |
| Legal titles | Jost | Titles and small-cap labels |
| Legal body | Arimo | Prose pages |

A single Hebrew verse is 48px, with line height about 1.85 and open word spacing. The verse number beside it is Inter at 14px in the secondary color. The translation under the verse is Inter at 17px. Translation-only text is 26px. On mobile the Hebrew verse sizes are 40, 35, and 52. Body text is 16px. Headings use medium weight and a line height of 1.5.

## Direction

Hebrew interface language sets the page to `rtl` and `lang="he"`. English and Spanish stay left to right. Hebrew scripture stays right to left even when the interface language is English or Spanish. Greek source text stays left to right.

Back chevrons point with the interface direction. Access codes, email addresses, and the support handle stay left to right inside a right-to-left page. Mobile rows and labels follow the same split: right-aligned Hebrew interface text, and a reversed row when the language is Hebrew.

## Wording

Interface copy lives in `locales/en.json`, `locales/es.json`, and `locales/he.json`. Web and mobile read those three files. The languages are English, Español, and עברית. A wording change updates the same key in all three files. A missing key falls back to English. Scripture, book titles, and lexicon text are not interface copy.

## Chrome

The navigation bar is centered, at most 620px wide, with the דבר wordmark and a pill of destinations. The open destination uses a soft accent wash. The scripture picker opens under that bar as book, chapter, and verse, in the same raised surface, and it collapses when the reader asks for reduced motion.

Settings are rows of about 50px with a pill switch. The switch is tekhelet when on and the border color when off. Assemblies entry is a centered column, at most 420px, with a short fade-in. Legal pages use a wide measure, about 940px, a quiet rise, and copper links. The word card is a raised panel; its Qumran state adds a copper wash and a copper glow on the same neumorphic shadow.

## Motion

Color, background, and shadow changes ease over 420ms. Word hover and press take about 180ms. The word panel enters over 220ms and closes without a flash. Verse blocks fade in over 400ms. The scripture picker opens over 280ms. Reduced motion removes that picker transition. Motion stays slow and small: a slight lift, a short fade, a soft shadow change.
