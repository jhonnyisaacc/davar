# Select a book

A reader opens the book list from the Book control, filters it, and lands on the first verse of the chosen book.

## Sub-features

- `select-book-open` opens the book list from the `Book` button.
- `select-book-filter` filters the list with the `Find book` box.
- `select-book-choose` opens Matthew 1:1 from the list.

## How to get to it (user POV)

- On the Scripture screen, choose the `Book` button in the `Book, Chapter, Verse` navigation.
- Choose `Scripture` in the top bar first if the Book button is missing.

## Driving it with scripts/control

Preconditions:

- The baseline web instance is healthy and the UI language is English.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`.
- **Open the list.** Run `bun scripts/control/web.ts drive click Book`. The text contains the book list, including `Matthew`.
- **Before proof.** Run `bun scripts/control/web.ts evidence`.
- **Filter.** Not drivable. `Find book` needs typed input, and `scripts/control/web.ts` has no `type` action. Report `select-book-filter` as not driven.
- **Choose Matthew.** Run `bun scripts/control/web.ts drive click Matthew`. The URL ends in `/verse/Matthew/1/1` and the text contains `Matthew | 1 | 1`.
- **After proof.** Run `bun scripts/control/web.ts evidence`.

## Gotchas

- Not yet driven with the harness. A list row matches only when its whole label is `Matthew`. If the row carries more text, the click fails with `control-not-found`. Record the row's text from `state` and update this file.
- Book names in the list are English canonical names (`Matthew`, not `Mateo`) while the UI language is English.
- Choosing a book stores the position in the browser profile. Later recipes in the same run reopen Matthew unless they use a deep link or a new `start`.
