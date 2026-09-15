import { describe, expect, test } from "bun:test";
import {
  buildRoutePath,
  findCanonicalBook,
  parseRoutePath,
} from "./routeState";

describe("route state", () => {
  test("round-trips the canonical Matthew verse route", () => {
    const route = parseRoutePath("/verse/Matthew/1/1");

    expect(route).toEqual({
      screen: "verse",
      book: "Matthew",
      chapter: 1,
      verse: 1,
    });
    if (!route) throw new Error("Expected a canonical verse route");
    expect(buildRoutePath(route)).toBe("/verse/Matthew/1/1");
  });

  test("does not reinterpret Spanish book aliases as canonical routes", () => {
    const route = parseRoutePath("/verse/Mateo/1/1");
    expect(route?.book).toBe("Mateo");
    expect(findCanonicalBook([{ name: "Matthew" }], route?.book)).toBeUndefined();
  });

  test("marks unknown top-level routes invalid", () => {
    expect(parseRoutePath("/not-a-route")).toBeNull();
  });
});
