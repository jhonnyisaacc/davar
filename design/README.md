# Davar UX source of truth

`design/davar.pen` is the canonical UX file for Davar as a unified biblical application.

Future UX work that changes the intended Davar experience should update **`design/davar.pen`** first. Implementation PRs should reference screen IDs from that file. This directory’s raster assets (`davar_blue.png`, banners) remain brand/marketing images; they are not the product UX spec.

This PR does **not** implement Shaul, Bore, or Qahal inside the running app.

## What this file is for

Davar is becoming one application with Scripture at the center:

| Area | Role in Davar | Source (read-only) |
| --- | --- | --- |
| **Scripture** | Primary reading experience | Current Davar web app (`web/src`) |
| **Commentary** | Study layer on the text | Shaul (`nota` + verse-notes API) |
| **Assemblies** | Congregations / belonging | Qahal (`feat/new-redesign` + `qahal.pen`) |
| **Widgets** | First widget: Biblical Calendar | Bore `feat/biblical-calendar-core` |
| **Settings** | Theme, language, reading modes | Current Davar settings |

Shaul, Bore, and Qahal are **not** separate products inside this UX. They are sources of functionality that Davar absorbs visually.

## Repository boundaries

| Repo | Role |
| --- | --- |
| **davar** (this repo) | Only repo this work may change |
| **shaul** | Read-only. Commentary concepts, `references`, `/api/v1/verse-notes/` |
| **bore** | Read-only. Authoritative branch: `feat/biblical-calendar-core` |
| **qahal** | Read-only. Authoritative UX: `/Users/jhonny/qahal/design/qahal.pen` and `feat/new-redesign` |

The original Qahal Pen file must stay byte-for-byte untouched. Assemblies screens in `davar.pen` are a **restyle** of that UX into Davar tokens, not a copy of Qahal’s purple/ink system.

## How `davar.pen` is organized

Horizontal rows read left to right as user stories.

| Section | Contents |
| --- | --- |
| **00 — Cover / Overview** | Product model: Scripture, Commentary, Assemblies, Widgets, Settings |
| **01 — Design Foundations** | Semantic tokens, type, spacing, radii, light / dark |
| **02 — Components** | Reusable library and variants, including liquid-glass mobile nav |
| **03 — Current Davar Baseline** | Representative shipping screens (top neumorph bar) |
| **04 — Unified Navigation** | Mobile liquid glass + desktop segmented IA |
| **05 — Scripture Flows** | Library → book → chapter → verse → word |
| **06 — Commentary / Shaul** | Verse → notas → detail → source (happy path only) |
| **07 — Widgets / Biblical Calendar** | Widgets → today → date / moed / pending |
| **08 — Assemblies / Qahal** | Full Qahal-derived experience in Davar chrome |
| **09 — Cross-feature + Open Questions** | Scripture ↔ commentary / calendar; unresolved decisions |

Reusable components live as top-level symbols (buttons, nav, verse, commentary card, calendar card, congregation row, states). Screens instance them.

## Design-system principles

Extracted from the **running Davar web UI**, especially `web/src/styles/theme.css`. This is not a rebrand.

- **Surfaces:** parchment `#FAF6F0` (light), Shafan brown `#3C3836` (dark)
- **Accent:** tekhelet `#7AA0D6` / `#92B5E8` — the only brand accent
- **Copper:** Qumran / word highlight only (`#C68F55`), not a second brand
- **Type:** Cardo (scripture), Inter (UI Latin), Suez One (wordmark / book names), Arimo (UI Hebrew)
- **Cards / actions:** neumorph dual shadows from current Davar
- **Glass:** reserved for floating chrome (today’s dropdowns; unified mobile nav)

### Normalization decisions

Where the current app is inconsistent, the Pen file follows the **most used production pattern**:

1. **Background** is production `#FAF6F0`, not the unused catalog ivory `#FDFDF9`.
2. **Settings** in the unified IA is a first-class destination (mobile full page + desktop segment). The current nav dropdown remains documented as the shipping baseline.
3. **Mobile primary nav is new:** a floating **liquid-glass** capsule (frost, rim, sheen, Scripture centered). The unused `BottomNavBar` (Home + Search FAB) is not the model.
4. **Desktop** keeps a top bar (current philosophy) with the same five areas in a centered segment. It is not a stretched phone and not a new sidebar product.
5. **Assemblies** uses Davar Inter / tekhelet / parchment. Qahal Manrope, Purple 800, and the Qof mark are not carried over as Davar identity.
6. **Widgets** never say “Bore”. The widget name is **Biblical Calendar**.
7. **Commentary** is the Davar label; the unit remains Shaul’s **nota**.

## Navigation

Intended IA:

`Assemblies | Commentary | Scripture | Widgets | Settings`

**Scripture is primary** — larger selected capsule, center of the bar.

- **Mobile:** liquid-glass bottom capsule, inset from the edges, not flush. Frosted fill, 1px rim, inner sheen, soft shadow.
- **Desktop:** same five destinations in the top chrome; reading location (book · chapter · verse) stays on the right.

Do not invent a different IA per platform.

## Screen IDs

Stable IDs for implementation issues/PRs:

| Prefix | Examples |
| --- | --- |
| `DAVAR-BASE-*` | Current shipping baseline |
| `DAVAR-NAV-*` | Unified navigation |
| `DAVAR-READ-*` | Scripture |
| `DAVAR-COMMENTARY-*` | Commentary happy path |
| `DAVAR-WIDGETS-*` / `DAVAR-CALENDAR-*` | Widgets / calendar |
| `DAVAR-ASSEMBLIES-*` | Qahal-derived assemblies |
| `DAVAR-SETTINGS-*` | Settings |
| `DAVAR-CROSS-*` | Cross-feature |

Example: `DAVAR-COMMENTARY-02 — Verse commentary list`

## Light and dark

Every foundational token is themed (`mode: light | dark`) where it changes.

Major proof points: foundations pair, `DAVAR-BASE-08`, `DAVAR-NAV-06`, `DAVAR-ASSEMBLIES-27/28/29`. Not every flow is duplicated in both themes; components and tokens define the system.

## Mobile and desktop

- Phone frames are 390 wide, content stacked, liquid-glass nav last in the stack.
- Desktop frames are ~1100×640–700 with `Nav/Desktop`.
- Tablet is not specified unless a flow already forces it.

## Audit notes (do not skip)

Inspected before drawing:

- **Davar:** `App.tsx` route shell, `NavigationBar`, `VerseDisplay`, `WordCard`, `BottomSheet`, `HomeScreen`, `SettingsScreen`, `theme.css`. Live visual language is the production CSS, not memory.
- **Shaul:** Markdown **notas**, frontmatter `references`, static verse-notes API (~8989 endpoints). No separate “commentary” schema. Topic is indirect (`temas` / tags / concepts).
- **Bore:** `feat/biblical-calendar-core` only — observation-driven months, sunset day boundary, `calendar.json` consumer contract, Scriptable today-widget. No Date/Moed screens in Bore; those are Davar-designed consumers.
- **Qahal:** `feat/new-redesign` + `docs/product/ux.md` + `paper-to-code.md` screen matrix. `qahal.pen` was inspected via that matrix and left unmodified (SHA-256 recorded at branch start: `a0a558e61a346c0309ef72de72b7a6befdb1a7a3195a5c317750d2269fa04b9b`).

Davar was not redesigned from GitHub screenshots.

## Open product questions

Do not silently resolve these in implementation.

### Commentary (Shaul)

- Default nota when several share one verse
- Unify `temas` / tags / concepts into one Topic — or keep them parallel
- Embed comparison-sheet text vs metadata + outbound link (licensing)
- Offline bundle vs WebView to shaul.vercel.app
- Graph home vs verse-first only

### Widgets (Bore)

- How production sets Aviv (`year_start_status` is `unresolved` today)
- UX for confirmed months with `month_id: null`
- Rosh Jodesh hidden when other events exist (Scriptable does this)
- Bikurim / Omer / Shavuot policy (not emitted)
- Moed detail content model (not in `calendar.json`)

### Assemblies (Qahal)

- Davar has no Telegram account. How does Assemblies authenticate?
- Who issues invite codes
- Visibility copy (privacy vs community)
- Existing women leaders — grandfather or hard rule
- Must both endorsers accept
- Can a leader also belong to another qahal
- Leadership transfer
- Age minimum / missing age
- Starting → Experienced later
- Telegram locale vs in-app language

### Cross-cutting

- Hebrew RTL: mirror the five destinations, or keep Scripture physically centered?
- Pen has no text-direction property; Hebrew in the file may not preview as true RTL. Implementation must remain RTL-correct.

## Rules for future updates

1. Change `design/davar.pen` when the canonical experience changes.
2. Keep Scripture visually and conceptually central.
3. Do not reintroduce Shaul / Bore / Qahal as separate brands.
4. Prefer semantic tokens (`surface-primary`, `text-secondary`, `accent-primary`, `glass-nav`, …).
5. Add an `OPEN QUESTION` annotation instead of inventing product policy.
6. Never edit `/Users/jhonny/qahal/design/qahal.pen` from Davar work.
7. Do not implement repository integrations in a UX-only change.
8. Mobile nav stays **liquid glass** unless a later approved design replaces it.

## Opening the file

`.pen` files are opened in [Pen](https://pen.dev) / the Pencil desktop app. Do not Read or Grep the binary. Use the Pencil MCP (`execute`, `get_app_state`) or the desktop editor.
