// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from "bun:test";
import {
  annualMoadim,
  calendarSources,
  confirmedMoadim,
  localSunsetClock,
  readingCalendarDay,
  readingCalendarPill,
} from "@davar/shared/calendarPresentation";
import {
  createCalendarClient,
  parseCalendarLocation,
  type CalendarState,
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
const calendarState = (
  overrides: Partial<CalendarState> = {},
): CalendarState => ({
  city,
  timezone: "America/Argentina/Buenos_Aires",
  calendar: calendar(),
  restored: true,
  busy: false,
  error: null,
  ...overrides,
});

describe("calendar presentation", () => {
  test("annual moadim distinguish an unloaded response from a loaded year with unresolved dates", () => {
    expect(annualMoadim(null, 2026)).toEqual([]);
    const rows = annualMoadim({ ...calendar(), days: [] }, 2026);
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.days.length === 0)).toBe(true);
  });
  test("annual Shavuot is dated from the confirmed fifty-day count even without a May month sighting", () => {
    const shavuot = day({
      civil_date: "2026-05-24",
      biblical: { day: null, month_id: null, month_ordinal: null },
      month_status: "pending",
      year_start_status: "unresolved",
      events: ["shavuot"],
      counted_events: [
        {
          event_id: "shavuot",
          status: "calculated",
          rule: "weekly_shabbat_during_hag_hamatzot",
          day_of_count: 50,
          wave_sheaf_civil_date: "2026-04-05",
          aviv_starts_on_evening: "2026-03-20",
          confirmation_id: "aviv",
          source_url: "https://example.test/aviv",
        },
      ],
    });
    expect(confirmedMoadim(shavuot)).toEqual(["shavuot"]);
    expect(
      annualMoadim(calendar(shavuot), 2026).find((row) => row.id === "shavuot")
        ?.days[0].civil_date,
    ).toBe("2026-05-24");
    expect(confirmedMoadim({ ...shavuot, counted_events: [] })).toEqual([]);
    expect(calendarSources(calendar(shavuot))).toEqual([
      {
        id: "observation",
        name: "observation",
        url: "https://example.test/aviv",
      },
    ]);
  });
  test("always-on reading pill asks for a city after location restoration", () => {
    const state = calendarState({ city: null, calendar: null });
    expect(readingCalendarPill(state, true)).toEqual({
      kind: "status",
      messageKey: "calendar.chooseCityPill",
    });
    expect(readingCalendarPill({ ...state, restored: false }, true)).toEqual({
      kind: "status",
      messageKey: "calendar.loading",
    });
    expect(readingCalendarPill(state, false)).toBeNull();
  });
  test("selecting a city changes the reading pill from loading to the confirmed day", () => {
    expect(
      readingCalendarPill(calendarState({ calendar: null, busy: true }), true),
    ).toEqual({ kind: "status", messageKey: "calendar.loading" });
    const state = calendarState();
    expect(readingCalendarPill(state, true)).toEqual({
      kind: "day",
      day: state.calendar!.days[0],
    });
    expect(readingCalendarPill({ ...state, busy: true }, true)?.kind).toBe(
      "day",
    );
  });
  test("always-on pill explains missing and stale data without displaying a date", () => {
    const unavailable = {
      kind: "status",
      messageKey: "calendar.dayUnavailable",
    } as const;
    expect(
      readingCalendarPill(calendarState({ calendar: null }), true),
    ).toEqual(unavailable);
    expect(
      readingCalendarPill(
        calendarState({ calendar: null, error: "network_error" }),
        true,
      ),
    ).toEqual(unavailable);
    const expired = {
      ...calendar(),
      next_sunset_at: new Date(Date.now() - 1000).toISOString(),
    };
    expect(
      readingCalendarPill(calendarState({ calendar: expired }), true),
    ).toEqual(unavailable);
    expect(
      readingCalendarPill(calendarState({ calendar: expired }), false),
    ).toBeNull();
    expect(
      readingCalendarPill(
        calendarState({ calendar: { ...calendar(), days: [] } }),
        true,
      ),
    ).toEqual(unavailable);
  });
  test("always-on pill shows pending confirmation instead of an unconfirmed date", () => {
    const pending = calendar(
      day({
        month_status: "pending",
        biblical: { day: null, month_id: null, month_ordinal: null },
      }),
    );
    const state = calendarState({ calendar: pending });
    expect(readingCalendarPill(state, true)).toEqual({
      kind: "status",
      messageKey: "calendar.awaitingConfirmation",
    });
    expect(readingCalendarPill(state, false)).toBeNull();
    expect(
      readingCalendarPill({ ...state, busy: true }, true),
    ).toEqual({
      kind: "status",
      messageKey: "calendar.awaitingConfirmation",
    });
  });
  test("reading pill preserves the default moadim-only behavior", () => {
    expect(readingCalendarPill(calendarState(), false)?.kind).toBe("day");
    const ordinary = calendarState({ calendar: calendar(day({ events: [] })) });
    expect(readingCalendarPill(ordinary, false)).toBeNull();
    expect(readingCalendarPill(ordinary, true)?.kind).toBe("day");
  });
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
  test("withholds festival identity without a confirmed year or explicit month anchor", () => {
    expect(confirmedMoadim(day({ year_start_status: "pending" }))).toEqual([]);
    expect(
      confirmedMoadim(day({ events: ["hag_hamatzot", "hag_hamatzot_last"] })),
    ).toEqual(["hag_hamatzot"]);
  });
  test("shows Shemini Atzeret from the explicit seventh-month anchor without substituting the rabbinic date", () => {
    const anchoredDay = day({
      biblical: { day: 22, month_id: "etanim", month_ordinal: 7 },
      rabbinic: { day: 23, month_id: "tishrei", year: 5787 },
      events: ["shemini_atzeret"],
      year_start_status: "unresolved",
      month_identity: {
        status: "manual",
        starts_on_evening: "2026-09-12",
        month_ordinal: 7,
        source_url: "https://example.test/seventh-month",
        note: "Synthetic explicit month anchor",
      },
    });
    expect(confirmedMoadim(anchoredDay)).toEqual(["shemini_atzeret"]);
    expect(readingCalendarDay(calendar(anchoredDay), false)).toBe(anchoredDay);
    expect(
      confirmedMoadim({ ...anchoredDay, month_status: "pending" }),
    ).toEqual([]);
    expect(confirmedMoadim({ ...anchoredDay, month_identity: null })).toEqual(
      [],
    );
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
  test("formats the civil day's sunset in the saved city timezone", () => {
    const sunsetAt = "2026-06-21T16:47:00.000Z";
    expect(localSunsetClock(sunsetAt, "Asia/Jerusalem", "en")).toBe("7:47 PM");
    expect(localSunsetClock(sunsetAt, "Asia/Jerusalem", "es")).toBe("19:47");
    expect(localSunsetClock(sunsetAt, "Asia/Jerusalem", "he")).toBe("19:47");
    expect(localSunsetClock(null, "Asia/Jerusalem", "en")).toBeNull();
    expect(localSunsetClock(sunsetAt, null, "en")).toBeNull();
    expect(localSunsetClock("not-a-time", "Asia/Jerusalem", "en")).toBeNull();
    expect(localSunsetClock(sunsetAt, "Not/AZone", "en")).toBeNull();
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
