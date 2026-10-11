# Calendar

The Calendar tab shows the biblical calendar based on local sunset. The first time, it asks the reader to choose a city, and the city can be changed later by tapping its name.

## Sub-features

- `calendar-open` opens the Calendar tab at `/widgets`.
- `calendar-city-prompt` shows `Choose your city` when no city is saved.
- `calendar-days` shows days and sunset times once a city is set (needs the API).

## How to get to it (user POV)

- Choose the `Calendar` tab in the top bar.
- Open `/widgets` directly.

## Driving it with control/web.ts

Preconditions:

- The baseline instance is healthy. The browser profile is new, so no city is saved.
- For `calendar-days`, also start the API with `bun scripts/control/server.ts start`.

- **Open Calendar.** Run `bun scripts/control/web.ts drive click Calendar`. The URL ends in `/widgets`, and the text contains `Choose your city` and `We’ll use it for your local sunset.`
- **Proof.** Run `bun scripts/control/web.ts evidence`.
- **Pick a city.** Not drivable yet. The city search needs typed input, and `scripts/control/web.ts` has no `type` action. Report `calendar-days` as not driven unless that action has been added.

## Gotchas

- The route is `/widgets`, not `/calendar`.
- The prompt uses a typographic apostrophe (`We’ll`). Match on `Choose your city` instead.
- Sunset times depend on the city and the date. Assert that a time appears, not a specific value.
