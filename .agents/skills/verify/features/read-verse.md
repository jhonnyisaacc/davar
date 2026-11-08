# Read a verse

The reader opens a verse by its URL, shows the Hebrew text with niqqud and its translation, and lets the reader step to the next verse. The address bar and the Book | chapter | verse pill both show the new position.

## Sub-features

- `verse-open` renders the Hebrew for a `/verse/<Book>/<chapter>/<verse>` URL.
- `verse-next` moves to the next verse and updates the URL and the pill.
- `verse-root` sends `/` to the reader at Genesis 1:1 on a new profile.
- `verse-wheel` moves forward with a downward wheel at desktop width.

## How to get to it (user POV)

- Open a shared verse link such as `/verse/Genesis/1/1`.
- Open `/`.
- Choose the `Scripture` tab when another screen is showing.
- Choose `Next verse` under the current verse (phone layout), or scroll down at desktop width.

## Driving it with scripts/control

Preconditions:

- The baseline web instance is healthy and `$DAVAR_VERIFY_ROOT/web/server.log` shows static data is ready.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`. The output URL ends in `/verse/Genesis/1/1`, and the text contains `בְּרֵאשִׁית בָּרָא אֱלֹהִים` and `Genesis | 1 | 1`.
- **Before proof.** Run `bun scripts/control/web.ts evidence`.
- **Step forward.** Run `bun scripts/control/web.ts drive click Next verse`. The URL ends in `/verse/Genesis/1/2`, and the text contains `Genesis | 1 | 2` and `וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ`.
- **After proof.** Run `bun scripts/control/web.ts evidence`. The screenshot shows the Genesis 1 2 pill and large Hebrew text with niqqud.
- **Root.** Run `bun scripts/control/web.ts drive open /`. The text contains `Genesis | 1 | 1`. Not yet driven; confirm on the first run.
- **Desktop wheel.** Not drivable. It needs a wider viewport and a scroll action, and `scripts/control/web.ts` has neither. Report `verse-wheel` as not driven.

## Gotchas

- Book names in the URL are English and case-sensitive (`Genesis`, not `genesis`).
- A page that says `Connection Error` or `Unable to load books` means static data was not served. That is a failed open, not a read.
- `Next verse` and `Previous verse` are hidden at 768px and wider. The harness window is 390x844, so they are on screen.
- Sefer style hides the verse control and shows a chapter. A new profile has it off.
- The Settings option `Calendar on verse` changes what appears under the verse. A new profile uses the defaults.
- The text in `drive` output is cut at 300 to 500 characters, so check the screenshot for anything further down.
- Don't copy the English translation into notes. It may be licensed TS2009 text.
