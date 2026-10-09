# Select a book

A reader opens the book list, filters it, and lands on the first verse of the chosen book.

## Sub-features

- `select-book-open` opens the book list from the Book button.
- `select-book-filter` filters the list with Find book.
- `select-book-choose` opens Matthew 1:1 from that list.

## How to get to it (user POV)

- On the Scripture screen, choose the `Book` button in the `Book, Chapter, Verse` nav.
- The Scripture row is hidden until `Scripture` is the current page and its section is expanded. Choose `Scripture` in the Davar nav if the Book button is missing.

## Driving it with the browser

Preconditions:

- Doctor exited 0 for `http://127.0.0.1:5193`.
- Language is English.
- The Scripture screen is showing.

- **Open the list.** Choose the button named `Book`. `#navigation-book-selector` appears with a textbox named `Find book`.
- **Filter.** Fill `Find book` with `Matthew`. The list shows Matthew and does not show Genesis.
- **Choose Matthew.** Choose the button in `#navigation-book-selector` whose text includes `Matthew`. The selector closes. The URL is `/verse/Matthew/1/1`. The `Book` button text includes `Matthew`. The `Chapter` button text is `1` and the `Verse` button text is `1`.
- **Proof.** Save `artifacts/select-book/matthew.snapshot.txt` and `artifacts/select-book/matthew.png`. Both show Davar and Matthew 1:1.

## Gotchas

- The nav `Book` button and the list row both contain the book name. Choose the row inside `#navigation-book-selector`.
- Book names in the list are the English canonical names (`Matthew`, not `Mateo`) while Language is English.
- Choosing a book stores the position in `localStorage` for this origin. Later recipes on this origin will reopen Matthew unless they use a deep link or a fresh origin.
