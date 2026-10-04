// Bun provides this module at runtime; Expo does not index it.
// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from "bun:test";
import {
  CALENDAR_LOCATION_KEY,
  createCalendarClient,
  parseCalendarLocation,
} from "@davar/shared/calendarClient";
import { readingCalendarPill } from "@davar/shared/calendarPresentation";
import type { CalendarResponse } from "@davar/shared/productContracts";

const city = {
  city: "Buenos Aires",
  country: "Argentina",
  latitude: -34.6,
  longitude: -58.4,
};
const timezone = "America/Argentina/Buenos_Aires";
const location = JSON.stringify({ city, timezone });
const calendar = (): CalendarResponse => ({
  schema_version: 1,
  timezone,
  year_start_status: "confirmed",
  generated_at: new Date().toISOString(),
  next_sunset_at: new Date(Date.now() + 3_600_000).toISOString(),
  days: [
    {
      civil_date: new Date().toISOString().slice(0, 10),
      biblical: { day: 22, month_id: "etanim", month_ordinal: 7 },
      rabbinic: { day: 23, month_id: "tishrei", year: 5787 },
      events: ["shemini_atzeret"],
      month_status: "confirmed",
      year_start_status: "confirmed",
      confirmation_id: "fixture-month",
    },
  ],
});
const storage = (initial = location) => {
  const values = new Map([[CALENDAR_LOCATION_KEY, initial]]);
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("calendar restart", () => {
  test("restores a saved day and reading pill before a slow network refresh completes", async () => {
    const saved = calendar();
    const cache = storage();
    const first = createCalendarClient(
      { request: async <T>() => saved as T },
      cache,
    );
    const stopFirst = first.start();
    await tick();
    stopFirst();

    const pending = deferred<CalendarResponse>();
    const restarted = createCalendarClient(
      { request: async <T>() => (await pending.promise) as T },
      cache,
    );
    const stop = restarted.start();
    try {
      await tick();
      expect(restarted.getSnapshot()).toMatchObject({
        city,
        timezone,
        calendar: saved,
        restored: true,
        busy: true,
      });
      expect(readingCalendarPill(restarted.getSnapshot(), true)?.kind).toBe(
        "day",
      );

      const fresh = calendar();
      fresh.days[0].biblical.day = 23;
      pending.resolve(fresh);
      await tick();
      expect(restarted.getSnapshot().calendar).toEqual(fresh);
      expect(restarted.getSnapshot().busy).toBe(false);
      expect(
        JSON.parse((await cache.getItem(CALENDAR_LOCATION_KEY))!).calendar,
      ).toEqual(fresh);
    } finally {
      stop();
    }
  });

  test("keeps a valid saved calendar visible when the restart refresh fails", async () => {
    const saved = calendar();
    const client = createCalendarClient(
      {
        request: async () => {
          throw new TypeError("offline");
        },
      },
      storage(JSON.stringify({ city, timezone, calendar: saved })),
    );
    const stop = client.start();
    try {
      await tick();
      expect(client.getSnapshot().calendar).toEqual(saved);
      expect(client.getSnapshot().error).toBe("offline");
      expect(readingCalendarPill(client.getSnapshot(), true)?.kind).toBe("day");
    } finally {
      stop();
    }
  });

  test("restores an older day before sunset with the existing stale reading behavior", async () => {
    const saved = calendar();
    saved.generated_at = new Date(Date.now() - 20 * 60_000).toISOString();
    const pending = deferred<CalendarResponse>();
    const client = createCalendarClient(
      { request: async <T>() => (await pending.promise) as T },
      storage(JSON.stringify({ city, timezone, calendar: saved })),
    );
    const stop = client.start();
    try {
      await tick();
      expect(client.getSnapshot().calendar).toEqual(saved);
      expect(readingCalendarPill(client.getSnapshot(), true)?.kind).toBe(
        "status",
      );
    } finally {
      stop();
      pending.resolve(calendar());
      await tick();
    }
  });

  test("discards expired, corrupt, future, or mismatched cached calendars without losing the city", async () => {
    const saved = calendar();
    const invalid = [
      { ...saved, next_sunset_at: new Date(Date.now() - 1000).toISOString() },
      {
        ...saved,
        generated_at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      },
      {
        ...saved,
        generated_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      { ...saved, next_sunset_at: "invalid" },
      { ...saved, generated_at: undefined },
      { ...saved, schema_version: 2 },
      { ...saved, timezone: "Asia/Jerusalem" },
      { ...saved, days: [{}] },
      { ...saved, days: [] },
    ];
    for (const value of invalid) {
      const pending = deferred<CalendarResponse>();
      const client = createCalendarClient(
        { request: async <T>() => (await pending.promise) as T },
        storage(JSON.stringify({ city, timezone, calendar: value })),
      );
      const stop = client.start();
      try {
        await tick();
        expect(client.getSnapshot().calendar).toBeNull();
        expect(client.getSnapshot().city).toEqual(city);
        expect(client.getSnapshot().restored).toBe(true);
      } finally {
        stop();
        pending.resolve(calendar());
        await tick();
      }
    }
  });

  test("legacy locations still restore and ignore unvalidated extra properties", async () => {
    expect(
      parseCalendarLocation(JSON.stringify({ city, timezone, calendar: {} })),
    ).toEqual({ city, timezone });
    const fresh = calendar();
    const client = createCalendarClient(
      { request: async <T>() => fresh as T },
      storage(),
    );
    const stop = client.start();
    try {
      await tick();
      expect(client.getSnapshot().calendar).toEqual(fresh);
    } finally {
      stop();
    }
  });

  test("a city selected during restoration replaces the persisted location", async () => {
    const read = deferred<string | null>();
    const cache = storage();
    const newCity = {
      city: "Jerusalem",
      country: "Israel",
      latitude: 31.8,
      longitude: 35.2,
    };
    const requests: string[] = [];
    const client = createCalendarClient(
      {
        request: async <T>(path: string) => {
          requests.push(path);
          return calendar() as T;
        },
      },
      { ...cache, getItem: () => read.promise },
    );
    const stop = client.start();
    try {
      client.selectCity(newCity);
      read.resolve(location);
      await tick();
      expect(client.getSnapshot().city).toEqual(newCity);
      expect(requests).toHaveLength(1);
      expect(
        new URLSearchParams(requests[0].split("?")[1]).get("latitude"),
      ).toBe("31.8");
      expect(
        parseCalendarLocation(await cache.getItem(CALENDAR_LOCATION_KEY))?.city,
      ).toEqual(newCity);
    } finally {
      stop();
    }
  });

  test("a late old-city response never reaches the persisted snapshot", async () => {
    const old = deferred<CalendarResponse>();
    const fresh = calendar();
    fresh.days[0].biblical.day = 23;
    let calls = 0;
    const cache = storage();
    const client = createCalendarClient(
      {
        request: async <T>() =>
          (++calls === 1 ? await old.promise : fresh) as T,
      },
      cache,
    );
    const stop = client.start();
    try {
      await tick();
      const newCity = {
        ...city,
        city: "Jerusalem",
        latitude: 31.8,
        longitude: 35.2,
      };
      client.selectCity(newCity);
      await tick();
      old.resolve(calendar());
      await tick();
      const saved = JSON.parse((await cache.getItem(CALENDAR_LOCATION_KEY))!);
      expect(saved.city).toEqual(newCity);
      expect(saved.calendar).toEqual(fresh);
    } finally {
      stop();
    }
  });

  test("a failed disk write does not turn a successful refresh into an error", async () => {
    const fresh = calendar();
    const client = createCalendarClient(
      { request: async <T>() => fresh as T },
      {
        getItem: async () => location,
        setItem: async () => {
          throw new Error("unavailable");
        },
      },
    );
    const stop = client.start();
    try {
      await tick();
      expect(client.getSnapshot()).toMatchObject({
        calendar: fresh,
        busy: false,
        error: null,
      });
    } finally {
      stop();
    }
  });
});
