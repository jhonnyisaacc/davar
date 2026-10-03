// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from "bun:test";
import {
  annualMoadim,
  calendarSources,
  confirmedMoadim,
  readingCalendarDay,
} from "@davar/shared/calendarPresentation";
import {
  createCalendarClient,
  parseCalendarLocation,
} from "@davar/shared/calendarClient";
import type {
  CalendarDay,
  CalendarResponse,
} from "@davar/shared/productContracts";

const day = (overrides: Partial<CalendarDay> = {}): CalendarDay => ({
  civil_date: "2026-04-02",
  biblical: { day: 14, month_id: "aviv", month_ordinal: 1 },
  rabbinic: { day: 14, month_id: "nisan", year: 5786 },
  events: ["pesach"],
  month_status: "confirmed",
  year_start_status: "confirmed",
  confirmation_id: "confirmed-month",
  ...overrides,
});
const calendar = (value = day()): CalendarResponse => ({
  schema_version: 1,
  days: [value],
  year_start_status: value.year_start_status,
  generated_at: new Date().toISOString(),
  next_sunset_at: new Date(Date.now() + 3600000).toISOString(),
});
const city = {
  city: "Buenos Aires",
  country: "Argentina",
  latitude: -34.6,
  longitude: -58.4,
};
const location = JSON.stringify({
  city,
  timezone: "America/Argentina/Buenos_Aires",
});

describe("calendar presentation", () => {
  test("shows the reading pill on moadim by default, with an opt-in for ordinary days", () => {
    expect(readingCalendarDay(calendar(), false)?.biblical.day).toBe(14);
    const ordinary = calendar(day({ events: ["shabbat"] }));
    expect(readingCalendarDay(ordinary, false)).toBeNull();
    expect(readingCalendarDay(ordinary, true)?.biblical.day).toBe(14);
  });
  test("never invents a reading date from pending observations or stale data", () => {
    expect(
      readingCalendarDay(calendar(day({ month_status: "pending" })), true),
    ).toBeNull();
    expect(
      readingCalendarDay(
        calendar(
          day({ biblical: { day: null, month_id: null, month_ordinal: null } }),
        ),
        true,
      ),
    ).toBeNull();
    expect(
      readingCalendarDay(
        {
          ...calendar(),
          next_sunset_at: new Date(Date.now() - 1000).toISOString(),
        },
        true,
      ),
    ).toBeNull();
  });
  test("withholds festival identity until the Biblical year is confirmed", () => {
    expect(confirmedMoadim(day({ year_start_status: "pending" }))).toEqual([]);
    expect(
      confirmedMoadim(day({ events: ["hag_hamatzot", "hag_hamatzot_last"] })),
    ).toEqual(["hag_hamatzot"]);
  });
  test("groups only confirmed current-year dates and leaves unresolved moadim pending", () => {
    const result = annualMoadim(
      {
        ...calendar(),
        days: [
          day(),
          day({ civil_date: "2025-04-02" }),
          day({
            civil_date: "2026-04-03",
            events: ["shavuot"],
            year_start_status: "pending",
          }),
        ],
      },
      2026,
    );
    expect(result.find((row) => row.id === "pesach")?.days).toHaveLength(1);
    expect(result.find((row) => row.id === "shavuot")?.days).toEqual([]);
  });
  test("source links exclude unsafe URLs and synthetic reports", () => {
    const evidence = {
      observed_on: "2026-03-20",
      source_url: "https://example.org/report",
      observers: [],
      locations: [],
      unaided: true,
      development_fixture: false,
    };
    expect(
      calendarSources(calendar(day({ observation: evidence })))[0]?.url,
    ).toBe(evidence.source_url);
    expect(
      calendarSources(
        calendar(
          day({
            observation: { ...evidence, source_url: "javascript:alert(1)" },
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      calendarSources(
        calendar(
          day({ observation: { ...evidence, development_fixture: true } }),
        ),
      ),
    ).toEqual([]);
  });
});

describe("calendar client", () => {
  test("validates persisted city and timezone before restoring", () => {
    expect(parseCalendarLocation(location)?.city).toEqual(city);
    expect(
      parseCalendarLocation(
        JSON.stringify({ city: { ...city, latitude: null }, timezone: "UTC" }),
      ),
    ).toBeNull();
    expect(
      parseCalendarLocation(
        JSON.stringify({ city, timezone: "invalid/timezone" }),
      ),
    ).toBeNull();
  });
  test("fetches the complete year within the existing 60-day limit", async () => {
    const requests: URLSearchParams[] = [];
    const api = {
      request: async <T>(path: string): Promise<T> => {
        const query = new URLSearchParams(path.split("?")[1]);
        requests.push(query);
        const first = new Date(query.get("instant")!);
        const days = Array.from(
          { length: Number(query.get("days")) },
          (_, index) =>
            day({
              civil_date: new Date(first.getTime() + index * 86400000)
                .toISOString()
                .slice(0, 10),
            }),
        );
        return { ...calendar(), days } as T;
      },
    };
    const client = createCalendarClient(api, {
      getItem: async () => location,
      setItem: async () => {},
    });
    const stop = client.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await client.year(2024);
    stop();
    expect(result.days).toHaveLength(366);
    expect(result.days[0].civil_date).toBe("2024-01-01");
    expect(result.days.at(-1)?.civil_date).toBe("2024-12-31");
    expect(requests.every((query) => Number(query.get("days")) <= 60)).toBe(
      true,
    );
  });
  test("changing city discards a late response for the previous city", async () => {
    let resolveOld: ((value: CalendarResponse) => void) | undefined;
    let count = 0;
    const api = {
      request: async <T>(): Promise<T> => {
        count++;
        if (count === 1)
          return (await new Promise<CalendarResponse>((resolve) => {
            resolveOld = resolve;
          })) as T;
        return calendar(day({ civil_date: "2026-04-03" })) as T;
      },
    };
    const client = createCalendarClient(api, {
      getItem: async () => location,
      setItem: async () => {},
    });
    const stop = client.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    client.selectCity({
      ...city,
      city: "Jerusalem",
      latitude: 31.8,
      longitude: 35.2,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveOld?.(calendar());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getSnapshot().calendar?.days[0].civil_date).toBe(
      "2026-04-03",
    );
    expect(client.getSnapshot().city?.city).toBe("Jerusalem");
    stop();
  });
});
