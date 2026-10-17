import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { CalendarState } from "@davar/shared/calendarClient";
import { calendarYear } from "@davar/shared/calendarPresentation";
import type { CalendarResponse } from "@davar/shared/productContracts";
import { CalendarPanel } from "../features/calendar/CalendarPanel";
import { calendarClient } from "../hooks/useCalendar";
import { type AppLanguage, translate } from "../hooks/useTranslation";
import { installTestDom } from "../testDom";

installTestDom("http://localhost:5300/calendar");
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);

const timezone = "America/Argentina/Buenos_Aires";
const year = calendarYear(timezone);
const annual: CalendarResponse = {
	schema_version: 1,
	year_start_status: "confirmed",
	generated_at: new Date().toISOString(),
	days: [
		{
			civil_date: `${year}-04-02`,
			biblical: { day: 14, month_id: "aviv", month_ordinal: 1 },
			rabbinic: { day: 14, month_id: "nisan", year: 5786 },
			events: ["pesach"],
			month_status: "confirmed",
			year_start_status: "confirmed",
			confirmation_id: "confirmed-month",
		},
	],
};
const state: CalendarState = {
	city: {
		city: "Buenos Aires",
		country: "Argentina",
		latitude: -34.6,
		longitude: -58.4,
	},
	timezone,
	calendar: annual,
	restored: true,
	busy: false,
	error: null,
};
let snapshot = spyOn(calendarClient, "getSnapshot");
let yearRequest = spyOn(calendarClient, "year");
beforeEach(() => {
	snapshot = spyOn(calendarClient, "getSnapshot").mockReturnValue(state);
	yearRequest = spyOn(calendarClient, "year").mockImplementation(
		() => new Promise(() => {}),
	);
});
afterEach(() => {
	cleanup();
	snapshot.mockRestore();
	yearRequest.mockRestore();
});

test("a shown day does not return to loading while a refresh is in flight", () => {
	snapshot.mockReturnValue({ ...state, busy: true });
	const ui = render(<CalendarPanel language="en" />);
	expect(ui.queryByText(translate("en", "calendar.loading"))).toBeNull();
	expect(ui.getByText("14")).toBeTruthy();
});

function openMoadim(language: AppLanguage = "en") {
	const ui = render(<CalendarPanel language={language} />);
	fireEvent.click(
		ui.getByRole("button", {
			name: `${translate(language, "calendar.appointedTimes")} ${translate(language, "calendar.moadimYear")}`,
		}),
	);
	return ui;
}

test("cached city results appear immediately without loading or a new request", async () => {
	snapshot.mockReturnValue({ ...state, city: null, calendar: null });
	const cached = spyOn(calendarClient, "cachedCities").mockReturnValue(
		state.city ? [state.city] : [],
	);
	const search = spyOn(calendarClient, "searchCities").mockRejectedValue(
		new Error("cached searches must not call the API"),
	);
	try {
		const ui = render(<CalendarPanel language="en" />);
		await act(async () => {
			fireEvent.change(
				ui.getByRole("textbox", {
					name: translate("en", "calendar.searchCity"),
				}),
				{ target: { value: "Buenos" } },
			);
		});
		expect(ui.getByText("Buenos Aires")).toBeTruthy();
		expect(ui.queryByRole("status")).toBeNull();
		expect(cached).toHaveBeenCalledWith("Buenos");
		expect(search).not.toHaveBeenCalled();
	} finally {
		cached.mockRestore();
		search.mockRestore();
	}
});

for (const language of ["en", "es", "he"] as const) {
	test(`cached Moadim dates open without loading or another year request (${language})`, () => {
		const cached = spyOn(calendarClient, "cachedYear").mockReturnValue(annual);
		try {
			let ui = openMoadim(language);
			const expectDates = () => {
				expect(ui.queryByRole("status")).toBeNull();
				expect(
					ui.getByText(translate(language, "calendar.events.pesach")),
				).toBeTruthy();
				expect(yearRequest).not.toHaveBeenCalled();
			};
			expectDates();
			fireEvent.click(
				ui.getByRole("button", { name: translate(language, "calendar.back") }),
			);
			fireEvent.click(
				ui.getByRole("button", {
					name: `${translate(language, "calendar.appointedTimes")} ${translate(language, "calendar.moadimYear")}`,
				}),
			);
			expectDates();
			ui.unmount();
			ui = openMoadim(language);
			expectDates();
		} finally {
			cached.mockRestore();
		}
	});

	test(`Moadim show loading until annual dates arrive (${language})`, async () => {
		let resolve!: (value: CalendarResponse) => void;
		yearRequest.mockImplementation(
			() =>
				new Promise((yes) => {
					resolve = yes;
				}),
		);
		const ui = openMoadim(language);
		expect(yearRequest).toHaveBeenCalledWith(year);
		expect(ui.getByRole("status").textContent).toBe(
			translate(language, "calendar.loading"),
		);
		expect(
			ui.queryByText(translate(language, "calendar.awaitingDates")),
		).toBeNull();
		expect(
			ui.queryByText(translate(language, "calendar.awaitingConfirmation")),
		).toBeNull();
		expect(
			ui.queryByText(translate(language, "calendar.events.pesach")),
		).toBeNull();

		await act(async () => resolve(annual));
		expect(ui.queryByRole("status")).toBeNull();
		expect(
			ui.getByText(translate(language, "calendar.events.pesach")),
		).toBeTruthy();
		expect(
			ui.getByText(
				{
					en: "April 2 · Aviv 14",
					es: "2 de abril · Aviv 14",
					he: "2 באפריל · 14 אביב",
				}[language],
			),
		).toBeTruthy();
		expect(
			ui.getByText(translate(language, "calendar.awaitingDates")),
		).toBeTruthy();
		expect(
			ui.getAllByText(translate(language, "calendar.awaitingConfirmation")),
		).toHaveLength(7);
	});
}

test("opening the calendar prefetches the year so Moadim shows the civil date", async () => {
	let resolve!: (value: CalendarResponse) => void;
	yearRequest.mockImplementation(
		() =>
			new Promise((yes) => {
				resolve = yes;
			}),
	);
	const ui = render(<CalendarPanel language="en" />);
	expect(yearRequest).toHaveBeenCalledWith(year);
	await act(async () => resolve(annual));
	fireEvent.click(
		ui.getByRole("button", {
			name: `${translate("en", "calendar.appointedTimes")} ${translate("en", "calendar.moadimYear")}`,
		}),
	);
	expect(ui.queryByRole("status")).toBeNull();
	expect(ui.getByText(translate("en", "calendar.events.pesach"))).toBeTruthy();
	expect(ui.getByText("April 2 · Aviv 14")).toBeTruthy();
});

test("day navigation keeps today on the current day and names the weekday beside it", async () => {
	const nextDay: CalendarResponse = {
		...annual,
		days: [{ ...annual.days[0], civil_date: "2026-10-19" }],
	};
	const previousDay: CalendarResponse = {
		...annual,
		days: [{ ...annual.days[0], civil_date: "2026-10-18" }],
	};
	const lookup = spyOn(calendarClient, "day").mockImplementation((offset) =>
		Promise.resolve(offset > 0 ? nextDay : previousDay),
	);
	try {
		for (const language of ["en", "es", "he"] as const) {
			const today = translate(language, "calendar.today");
			const weekday = { en: "Monday", es: "lunes", he: "יום שני" }[language];
			const earlier = { en: "Sunday", es: "domingo", he: "יום ראשון" }[
				language
			];
			const ui = render(<CalendarPanel language={language} />);
			expect(ui.getByRole("button", { name: today })).toBeTruthy();
			expect(ui.queryByText(`${year}-04-02`)).toBeNull();
			await act(async () => {
				fireEvent.click(
					ui.getByRole("button", {
						name: translate(language, "calendar.nextDay"),
					}),
				);
			});
			const next = ui.getByRole("button", { name: weekday });
			expect(next.textContent).toBe(weekday);
			expect(next.textContent ?? "").not.toMatch(/\d/);
			expect(ui.queryByText("2026-10-19")).toBeNull();
			await act(async () => {
				fireEvent.click(next);
			});
			expect(ui.getByRole("button", { name: today })).toBeTruthy();
			await act(async () => {
				fireEvent.click(
					ui.getByRole("button", {
						name: translate(language, "calendar.previousDay"),
					}),
				);
			});
			expect(ui.getByRole("button", { name: earlier }).textContent).toBe(
				earlier,
			);
			expect(ui.queryByText("2026-10-18")).toBeNull();
			ui.unmount();
		}
	} finally {
		lookup.mockRestore();
	}
});

test("an annual lookup failure shows retry without claiming dates await confirmation", async () => {
	yearRequest.mockRejectedValueOnce(new Error("offline"));
	const ui = openMoadim();
	await act(async () => {});
	expect(ui.getByRole("status").textContent).toContain(
		translate("en", "calendar.yearUnavailable"),
	);
	expect(ui.queryByText(translate("en", "calendar.loading"))).toBeNull();
	expect(ui.queryByText(translate("en", "calendar.awaitingDates"))).toBeNull();
	expect(
		ui.queryByText(translate("en", "calendar.awaitingConfirmation")),
	).toBeNull();
	yearRequest.mockResolvedValueOnce(annual);
	await act(async () => {
		fireEvent.click(
			ui.getByRole("button", { name: translate("en", "common.retry") }),
		);
	});
	expect(ui.queryByRole("status")).toBeNull();
	expect(ui.getByText(translate("en", "calendar.events.pesach"))).toBeTruthy();
});
