import { useEffect, useSyncExternalStore } from "react";
import { createCalendarClient } from "@davar/shared/calendarClient";
import { calendarIsOutdated } from "@davar/shared/calendarRefresh";
import { productApi } from "../services/productApi";

export const calendarClient = createCalendarClient(productApi, {
	getItem: async (key) => localStorage.getItem(key),
	setItem: async (key, value) => localStorage.setItem(key, value),
});
export function useCalendar() {
	return useSyncExternalStore(
		calendarClient.subscribe,
		calendarClient.getSnapshot,
		calendarClient.getSnapshot,
	);
}
export function useCalendarLifecycle() {
	useEffect(() => {
		const stop = calendarClient.start();
		const resume = () => {
			if (document.hidden) return;
			const { calendar } = calendarClient.getSnapshot();
			if (calendar && !calendarIsOutdated(calendar)) return;
			void calendarClient.refresh();
		};
		window.addEventListener("focus", resume);
		window.addEventListener("online", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			stop();
			window.removeEventListener("focus", resume);
			window.removeEventListener("online", resume);
			document.removeEventListener("visibilitychange", resume);
		};
	}, []);
}
