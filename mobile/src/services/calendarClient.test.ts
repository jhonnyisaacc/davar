// Bun provides this module at runtime; Expo does not index it.
// eslint-disable-next-line import/no-unresolved
import { describe, expect, spyOn, test } from "bun:test";
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
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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

describe("city search cache", () => {
  test("reuses normalized searches while preserving accents and Hebrew names", async () => {
    const requests: string[] = [];
    const client = createCalendarClient(
      {
        request: async <T>(path: string, options?: { public?: boolean }) => {
          expect(options?.public).toBe(true);
          requests.push(path);
          return { cities: [city] } as T;
        },
      },
      storage(),
    );
    for (const [query, repeat] of [
      [" Buenos   Aires ", "BUENOS AIRES"],
      ["SA\u0303O PAULO", "são paulo"],
      ["MÁLAGA", "málaga"],
      [" ירושלים ", "ירושלים"],
    ]) {
      expect(client.cachedCities(query)).toBeUndefined();
      await client.searchCities(query);
      expect(client.cachedCities(repeat)).toEqual([city]);
      await client.searchCities(repeat);
    }
    expect(
      requests.map((path) => new URLSearchParams(path.split("?")[1]).get("q")),
    ).toEqual(["buenos aires", "são paulo", "málaga", "ירושלים"]);
    // Accented and unaccented searches may return different matches.
    expect(client.cachedCities("malaga")).toBeUndefined();
  });

  test("shares an in-flight search and retries a failure instead of caching it", async () => {
    const pending = deferred<{ cities: (typeof city)[] }>();
    let calls = 0;
    const client = createCalendarClient(
      {
        request: async <T>() => {
          calls++;
          return (
            calls === 1 ? await pending.promise : { cities: [city] }
          ) as T;
        },
      },
      storage(),
    );
    const first = client.searchCities("Buenos");
    const repeated = client.searchCities(" BUENOS ");
    expect(repeated).toBe(first);
    expect(calls).toBe(1);
    pending.reject(new Error("unavailable"));
    await expect(first).rejects.toThrow("unavailable");
    expect(client.cachedCities("Buenos")).toBeUndefined();
    expect(await client.searchCities("Buenos")).toEqual([city]);
    expect(calls).toBe(2);
  });

  test("empty results are cached and expire after a day even when reused", async () => {
    let time = 1000;
    let calls = 0;
    const clock = spyOn(Date, "now").mockImplementation(() => time);
    try {
      const client = createCalendarClient(
        {
          request: async <T>() => {
            calls++;
            return { cities: [] } as T;
          },
        },
        storage(),
      );
      await client.searchCities("Nowhere");
      time += 24 * 60 * 60 * 1000 - 1;
      expect(client.cachedCities("nowhere")).toEqual([]);
      await client.searchCities("nowhere");
      expect(calls).toBe(1);
      time++;
      expect(client.cachedCities("nowhere")).toBeUndefined();
      await client.searchCities("nowhere");
      expect(calls).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });

  test("bounds the cache to 100 searches and keeps recently used results", async () => {
    let calls = 0;
    const client = createCalendarClient(
      {
        request: async <T>() => {
          calls++;
          return { cities: [city] } as T;
        },
      },
      storage(),
    );
    for (let index = 0; index < 100; index++)
      await client.searchCities(`City ${index}`);
    await client.searchCities("city 0");
    await client.searchCities("city 100");
    expect(calls).toBe(101);
    expect(client.cachedCities("city 0")).toEqual([city]);
    expect(client.cachedCities("city 1")).toBeUndefined();
    await client.searchCities("city 1");
    expect(calls).toBe(102);
  });
});

describe("annual calendar loading", () => {
  function chunk(query: URLSearchParams): CalendarResponse {
    const first = Date.parse(query.get("instant")!);
    return {
      ...calendar(),
      days: Array.from({ length: Number(query.get("days")) }, (_, index) => ({
        ...calendar().days[0],
        civil_date: new Date(first + index * 86400000)
          .toISOString()
          .slice(0, 10),
      })),
    };
  }

  test("starts every chunk together, shares in-flight requests, and reuses the completed year", async () => {
    const chunks: {
      query: URLSearchParams;
      pending: ReturnType<typeof deferred<CalendarResponse>>;
    }[] = [];
    const client = createCalendarClient(
      {
        request: async <T>(path: string) => {
          const query = new URLSearchParams(path.split("?")[1]);
          if (query.get("days") === "14") return calendar() as T;
          const pending = deferred<CalendarResponse>();
          chunks.push({ query, pending });
          return (await pending.promise) as T;
        },
      },
      storage(),
    );
    const stop = client.start();
    try {
      await tick();
      const first = client.year(2024);
      expect(client.year(2024)).toBe(first);
      // Every request must start before any response arrives.
      expect(chunks).toHaveLength(7);
      expect(chunks.every(({ query }) => Number(query.get("days")) <= 60)).toBe(
        true,
      );
      expect(client.cachedYear(2024)).toBeUndefined();
      for (const { query, pending } of [...chunks].reverse())
        pending.resolve(chunk(query));
      const result = await first;
      expect(result.days).toHaveLength(366);
      expect(result.days[0].civil_date).toBe("2024-01-01");
      expect(result.days.at(-1)?.civil_date).toBe("2024-12-31");
      expect(client.cachedYear(2024)).toBe(result);
      expect(client.cachedYear(2025)).toBeUndefined();
      expect(await client.year(2024)).toBe(result);
      expect(chunks).toHaveLength(7);
    } finally {
      stop();
    }
  });

  test("expires a cached year after fifteen minutes without extending it on reuse", async () => {
    let now = Date.now();
    const clock = spyOn(Date, "now").mockImplementation(() => now);
    let requests = 0;
    const client = createCalendarClient(
      {
        request: async <T>(path: string) => {
          const query = new URLSearchParams(path.split("?")[1]);
          if (query.get("days") === "14") return calendar() as T;
          requests++;
          return chunk(query) as T;
        },
      },
      storage(),
    );
    const stop = client.start();
    try {
      await tick();
      const first = await client.year(2026);
      expect(first.days).toHaveLength(365);
      now += 15 * 60 * 1000 - 1;
      expect(await client.year(2026)).toBe(first);
      expect(requests).toBe(7);
      now++;
      expect(client.cachedYear(2026)).toBeUndefined();
      expect(await client.year(2026)).not.toBe(first);
      expect(requests).toBe(14);
    } finally {
      stop();
      clock.mockRestore();
    }
  });

  for (const change of ["city", "refresh"] as const) {
    test(`${change} invalidates annual requests and prevents old responses from repopulating the cache`, async () => {
      const chunks: ReturnType<typeof deferred<CalendarResponse>>[] = [];
      const client = createCalendarClient(
        {
          request: async <T>(path: string) => {
            const query = new URLSearchParams(path.split("?")[1]);
            if (query.get("days") === "14") return calendar() as T;
            const pending = deferred<CalendarResponse>();
            chunks.push(pending);
            return (await pending.promise) as T;
          },
        },
        storage(),
      );
      const stop = client.start();
      const changeCalendar = async () => {
        if (change === "city") {
          client.selectCity({
            ...city,
            city: "Jerusalem",
            latitude: 31.8,
            longitude: 35.2,
          });
          await tick();
        } else await client.refresh();
      };
      try {
        await tick();
        const old = client.year(2026);
        await changeCalendar();
        const fresh = client.year(2026);
        expect(fresh).not.toBe(old);
        expect(chunks).toHaveLength(14);
        for (const pending of chunks.slice(0, 7)) pending.resolve(calendar());
        await old;
        expect(client.cachedYear(2026)).toBeUndefined();
        expect(client.year(2026)).toBe(fresh);
        for (const pending of chunks.slice(7)) pending.resolve(calendar());
        expect(client.cachedYear(2026)).toBeUndefined();
        const result = await fresh;
        expect(client.cachedYear(2026)).toBe(result);
        await changeCalendar();
        expect(client.cachedYear(2026)).toBeUndefined();
      } finally {
        stop();
      }
    });
  }

  test("failed chunks never cache an incomplete year and a subsequent lookup retries", async () => {
    let requests = 0;
    const client = createCalendarClient(
      {
        request: async <T>(path: string) => {
          const query = new URLSearchParams(path.split("?")[1]);
          if (query.get("days") === "14") return calendar() as T;
          if (++requests === 4) throw new Error("offline");
          return chunk(query) as T;
        },
      },
      storage(),
    );
    const stop = client.start();
    try {
      await tick();
      await expect(client.year(2026)).rejects.toThrow("offline");
      expect(requests).toBe(7);
      expect(client.cachedYear(2026)).toBeUndefined();
      expect((await client.year(2026)).days).toHaveLength(365);
      expect(requests).toBe(14);
    } finally {
      stop();
    }
  });
});

function addCivilDays(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function zonedParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    civil: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
  };
}

describe("calendar day paging", () => {
  function daysFrom(anchor: string, count: number): CalendarResponse {
    return {
      ...calendar(),
      days: Array.from({ length: count }, (_, index) => {
        const civil = addCivilDays(anchor, index);
        return {
          ...calendar().days[0],
          civil_date: civil,
          biblical: {
            day: Number(civil.slice(8)),
            month_id: "aviv",
            month_ordinal: 1,
          },
        };
      }),
    };
  }

  test("reuses the loaded days and fetches one unsynced window for the days beyond them", async () => {
    const requests: URLSearchParams[] = [];
    const paging: {
      query: URLSearchParams;
      pending: ReturnType<typeof deferred<CalendarResponse>>;
    }[] = [];
    const client = createCalendarClient(
      {
        request: async <T>(path: string) => {
          const query = new URLSearchParams(path.split("?")[1]);
          requests.push(query);
          if (query.get("refresh") !== "0") {
            const anchor =
              Number(query.get("latitude")) > 0 ? "2026-07-01" : "2026-06-01";
            return daysFrom(anchor, 14) as T;
          }
          const pending = deferred<CalendarResponse>();
          paging.push({ query, pending });
          return (await pending.promise) as T;
        },
      },
      storage(),
    );
    const stop = client.start();
    try {
      await tick();
      expect(requests).toHaveLength(1);
      expect(requests[0].get("refresh")).toBeNull();
      expect(requests[0].get("days")).toBe("14");
      for (let offset = 1; offset <= 13; offset++) {
        const day = await client.day(offset);
        expect(day.days).toHaveLength(1);
        expect(day.days[0].civil_date).toBe(addCivilDays("2026-06-01", offset));
      }
      expect(paging).toHaveLength(0);

      const fourteenth = client.day(14);
      const sixteenth = client.day(16);
      expect(paging).toHaveLength(1);
      const forward = zonedParts(paging[0].query.get("instant")!, timezone);
      expect(paging[0].query.get("refresh")).toBe("0");
      expect(paging[0].query.get("days")).toBe("14");
      expect(forward).toEqual({ civil: "2026-06-09", hour: "12" });
      paging[0].pending.resolve(daysFrom("2026-06-09", 14));
      expect((await fourteenth).days[0].biblical.day).toBe(15);
      expect((await sixteenth).days[0].civil_date).toBe("2026-06-17");
      expect(await client.day(21)).toMatchObject({
        days: [{ civil_date: "2026-06-22" }],
      });
      expect(paging).toHaveLength(1);

      const yesterday = client.day(-1);
      const earlier = client.day(-3);
      expect(paging).toHaveLength(2);
      expect(zonedParts(paging[1].query.get("instant")!, timezone).civil).toBe(
        "2026-05-25",
      );
      paging[1].pending.resolve(daysFrom("2026-05-25", 14));
      expect((await yesterday).days[0].civil_date).toBe("2026-05-31");
      expect((await earlier).days[0].civil_date).toBe("2026-05-29");

      client.selectCity({ ...city, latitude: 31.7, longitude: 35.2 });
      await tick();
      expect((await client.day(1)).days[0].civil_date).toBe("2026-07-02");
      expect(paging).toHaveLength(2);
      expect(requests).toHaveLength(4);
    } finally {
      stop();
    }
  });
});
