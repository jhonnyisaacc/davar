import { useEffect, useState, useSyncExternalStore } from "react";
import { createCalendarWorkspace } from "@davar/shared/calendarWorkspace";
import type { CalendarCity } from "@davar/shared/calendarClient";
import type { CalendarResponse } from "@davar/shared/productContracts";
import { calendarClient } from "./useCalendar";

export function useCalendarWorkspace({
  city,
  calendar,
  view,
  query,
  offset,
  year,
  annualAttempt,
}: {
  city: CalendarCity | null;
  calendar: CalendarResponse | null;
  view: string;
  query: string;
  offset: number;
  year: number;
  annualAttempt: number;
}) {
  const [workspace] = useState(() => createCalendarWorkspace(calendarClient));
  const state = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot,
  );
  useEffect(
    () => workspace.searchCities(query, view === "city"),
    [workspace, query, view],
  );
  useEffect(
    () => workspace.loadDay(offset, !!city),
    [workspace, city, offset, calendar],
  );
  useEffect(
    () => workspace.loadYear(year, !!city && view === "moadim"),
    [workspace, city, view, year, annualAttempt],
  );
  return state;
}
