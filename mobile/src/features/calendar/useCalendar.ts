import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createCalendarClient } from "@davar/shared/calendarClient";
import { calendarIsOutdated } from "@davar/shared/calendarRefresh";
import { productApi } from "../account/session";

export const calendarClient = createCalendarClient(productApi, AsyncStorage);
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
    const resume = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const { calendar } = calendarClient.getSnapshot();
      if (calendar && !calendarIsOutdated(calendar)) return;
      void calendarClient.refresh();
    });
    return () => {
      resume.remove();
      stop();
    };
  }, []);
}
