import { describe, expect, test } from "bun:test";
import { DESTINATIONS } from "../destinations";
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

  test("round-trips each static screen path", () => {
    const cases = [
      ["/home", "home"],
      ["/terms", "terms"],
      ["/privacy", "privacy"],
      ["/feedback", "feedback"],
      ["/donate", "donate"],
      ["/features", "features"],
      ["/settings", "settings"],
    ] as const;

    for (const [path, screen] of cases) {
      const route = parseRoutePath(path);
      expect(route).toEqual({ screen });
      expect(buildRoutePath({ screen })).toBe(path);
      if (!route) throw new Error(`Expected ${path} to parse`);
      expect(buildRoutePath(route)).toBe(path);
    }
  });

  test("round-trips the root path as the verse screen", () => {
    const route = parseRoutePath("/");
    expect(route).toEqual({ screen: "verse" });
    expect(buildRoutePath({ screen: "verse" })).toBe("/");
    if (!route) throw new Error("Expected / to parse");
    expect(buildRoutePath(route)).toBe("/");
  });

  test("round-trips a Genesis verse path", () => {
    const path = "/verse/Genesis/1/1";
    const route = parseRoutePath(path);
    expect(route).toEqual({
      screen: "verse",
      book: "Genesis",
      chapter: 1,
      verse: 1,
    });
    if (!route) throw new Error(`Expected ${path} to parse`);
    expect(buildRoutePath(route)).toBe(path);
  });

  test("writes a slash for screens that have no address", () => {
    expect(buildRoutePath({ screen: "notFound" })).toBe("/");
    expect(buildRoutePath({ screen: "connectionError" })).toBe("/");
  });

  test("strips a trailing slash before matching a screen", () => {
    expect(parseRoutePath("/settings/")).toEqual({ screen: "settings" });
  });

  test("round-trips every destination path", () => {
    for (const destination of DESTINATIONS) {
      const path =
        destination.id === "verse" ? "/verse/Genesis/1/1" : destination.path;
      const route = parseRoutePath(path);
      if (!route) throw new Error(`Expected ${path} to parse`);
      expect(buildRoutePath(route)).toBe(path);
    }
  });
});
