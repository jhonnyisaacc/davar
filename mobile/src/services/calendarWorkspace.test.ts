// eslint-disable-next-line import/no-unresolved -- Bun provides its built-in test module.
import { expect, test } from "bun:test";
import { createCalendarWorkspace } from "@davar/shared/calendarWorkspace";
import type { CalendarResponse } from "@davar/shared/productContracts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = { days: [] } as unknown as CalendarResponse;
const tick = () => Promise.resolve();

test("city searches retain the 600ms debounce and ignore superseded results", async () => {
  const pending = deferred<[]>();
  const tasks: (() => void)[] = [];
  let calls = 0;
  const workspace = createCalendarWorkspace(
    {
      searchCities: async () => {
        calls++;
        return pending.promise;
      },
      day: async () => response,
      year: async () => response,
    },
    (task, delay) => {
      expect(delay).toBe(600);
      tasks.push(task);
      return () => {
        tasks.splice(tasks.indexOf(task), 1);
      };
    },
  );
  const cancelFirst = workspace.searchCities("Buenos", true);
  expect(calls).toBe(0);
  cancelFirst?.();
  expect(tasks).toHaveLength(0);
  const cancelSecond = workspace.searchCities("Jerusalem", true);
  tasks[0]();
  expect(calls).toBe(1);
  cancelSecond?.();
  workspace.searchCities("", false);
  pending.resolve([]);
  await tick();
  await tick();
  expect(workspace.getSnapshot().cities).toEqual({
    data: [],
    busy: false,
    error: false,
    searched: false,
  });
});

test("a late day lookup cannot replace a newer selection or today's calendar", async () => {
  const first = deferred<CalendarResponse>();
  const second = deferred<CalendarResponse>();
  const workspace = createCalendarWorkspace({
    searchCities: async () => [],
    day: (offset) => (offset === 1 ? first.promise : second.promise),
    year: async () => response,
  });
  const cancel = workspace.loadDay(1, true);
  cancel?.();
  workspace.loadDay(2, true);
  second.resolve(response);
  await tick();
  first.resolve({ ...response });
  await tick();
  expect(workspace.getSnapshot().day.data).toBe(response);
  workspace.loadDay(0, true);
  expect(workspace.getSnapshot().day.data).toBeNull();
  expect(workspace.getSnapshot().day.busy).toBe(false);
});

test("annual failures can retry and abandoned requests do not update subscribers", async () => {
  const pending = deferred<CalendarResponse>();
  let attempt = 0;
  let updates = 0;
  const workspace = createCalendarWorkspace({
    searchCities: async () => [],
    day: async () => response,
    year: () =>
      ++attempt === 1 ? Promise.reject(new Error("offline")) : pending.promise,
  });
  const unsubscribe = workspace.subscribe(() => {
    updates++;
  });
  workspace.loadYear(2026, true);
  await tick();
  expect(workspace.getSnapshot().annual.error).toBe(true);
  const cancel = workspace.loadYear(2026, true);
  expect(workspace.getSnapshot().annual.error).toBe(false);
  expect(workspace.getSnapshot().annual.busy).toBe(true);
  cancel?.();
  const before = updates;
  pending.resolve(response);
  await tick();
  expect(updates).toBe(before);
  unsubscribe();
  workspace.loadYear(2026, false);
  expect(attempt).toBe(2);
});
