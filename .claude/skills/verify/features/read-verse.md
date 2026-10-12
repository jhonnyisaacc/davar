# Read a verse

The reader opens a verse by its URL, shows the Hebrew text with niqqud and its translation, and lets the reader step to the next verse.

## Sub-features

- `verse-open` renders the Hebrew for a `/verse/<Book>/<chapter>/<verse>` URL.
- `verse-next` moves to the next verse and updates the URL and the Book | chapter | verse pill.
- `verse-root` sends `/` to the reader.

## How to get to it (user POV)

- Open a shared verse link such as `/verse/Genesis/1/1`.
- Choose the `Scripture` tab.
- Choose `Next verse` under the current verse.

## Driving it with control/web.ts

Preconditions:

- The baseline instance is healthy.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`. The output URL ends in `/verse/Genesis/1/1`, and the text contains `בְּרֵאשִׁית בָּרָא אֱלֹהִים` and `Genesis | 1 | 1`.
- **Before proof.** Run `bun scripts/control/web.ts evidence`.
- **Step forward.** Run `bun scripts/control/web.ts drive click Next verse`. The URL ends in `/verse/Genesis/1/2`, and the text contains `Genesis | 1 | 2` and `וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ`.
- **After proof.** Run `bun scripts/control/web.ts evidence`. The screenshot shows the Genesis 1 2 pill and large Hebrew text with niqqud.

## Gotchas

- Book names in the URL are English and case-sensitive (`Genesis`, not `genesis`).
- The Settings option `Calendar on verse` changes what appears under the verse. A new profile uses the defaults.
- The text in `drive` output is cut at 300 to 500 characters, so check the screenshot for anything further down.
