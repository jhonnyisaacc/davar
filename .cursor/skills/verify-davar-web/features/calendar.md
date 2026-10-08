# Open the calendar

A reader opens the biblical calendar from the nav or from its deep link and sees the calendar title.

## Sub-features

- `calendar-nav` opens the calendar from the Calendar button.
- `calendar-deep-link` opens the same screen from `/widgets`.

## How to get to it (user POV)

- Choose `Calendar` in the Davar nav.
- Open `http://127.0.0.1:5193/widgets`.

## Driving it with the browser

Preconditions:

- Doctor exited 0 for `http://127.0.0.1:5193`.
- Language is English.

- **Nav.** From Scripture, choose `Calendar`. The URL is `/widgets`. A heading reads `Biblical Calendar`. `Calendar` is the current page in the Davar nav.
- **Deep link.** Open `http://127.0.0.1:5193/widgets` directly. The same heading is visible.
- **Proof.** Save `artifacts/calendar/open.snapshot.txt` and `artifacts/calendar/open.png`. Both show Davar and `Biblical Calendar`.

## Gotchas

- The first visit can show `Choose your city` before the month. That chooser is the calendar screen, not a failure. The heading for that step is still part of the calendar flow; record which heading appeared.
- Day data may be fetched from the network. `Calendar unavailable` proves the screen rendered and the request failed. Do not treat that status as a navigation failure.
- Choosing `Scripture` returns to the verse. The calendar does not change the stored verse.
