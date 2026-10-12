# Read a verse

A reader lands on one verse and moves to the next. The address bar and the Verse control both show the new position.

## Sub-features

- `read-verse-open` opens Genesis 1:1 from the root and from a deep link.
- `read-verse-next` moves to Genesis 1:2 with the Next verse button.
- `read-verse-wheel` moves forward with a downward wheel at desktop width.

## How to get to it (user POV)

- Open `http://127.0.0.1:5193/`.
- Open `http://127.0.0.1:5193/verse/Genesis/1/1`.
- Press `Scripture` in the Davar nav when another screen is showing.

## Driving it with the browser

Preconditions:

- Doctor exited 0 for `http://127.0.0.1:5193`.
- This origin has empty `localStorage`, or the reader was not left on another verse.
- Language is English.

- **Deep link.** Open `http://127.0.0.1:5193/verse/Genesis/1/1`. The nav `Davar` shows `Scripture` as the current page. The `Book` button text includes `Genesis`. The `Verse` button text is `1`. The URL stays `/verse/Genesis/1/1`.
- **Root.** Open `http://127.0.0.1:5193/`. The same Genesis 1:1 controls are visible. The URL may remain `/` until the reader navigates.
- **Next verse button.** Set the viewport to 390×844. Choose `Next verse`. The URL becomes `/verse/Genesis/1/2` and the `Verse` button text is `2`. A Hebrew word button is still visible. Clear device emulation after the snapshot.
- **Desktop wheel.** At a width of at least 768px, scroll the page downward by more than 36px once, then wait past the 500ms cooldown. The URL becomes the next verse and the `Verse` button matches it. A second scroll inside the cooldown does not move again.
- **Proof.** Save the Genesis 1:2 state to `artifacts/read-verse/next.snapshot.txt` and `artifacts/read-verse/next.png`. Both show Davar, Genesis, and verse 2.

## Gotchas

- `Next verse` and `Previous verse` are hidden at 768px and wider. A desktop-width click will not find them.
- Wheel events smaller than 36px, and a second wheel within 500ms, do not change the verse.
- An open book, chapter, verse, or settings menu blocks wheel navigation. Close it first.
- Sefer style hides the verse control and shows a chapter. Turn Sefer style off before this recipe.
- Do not copy the English translation into notes. It may be licensed TS2009 text loaded through `/api/ts2009/*`.
