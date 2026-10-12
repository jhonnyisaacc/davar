import { describe, expect, test } from "bun:test";
import { centerPrimaryDestination } from "./destinations";

function centeredIds(ids: readonly string[]): string[] {
  return centerPrimaryDestination(ids.map((id) => ({ id }))).map((item) => item.id);
}

describe("centerPrimaryDestination", () => {
  test("puts one neighbor on each side when only calendar and settings remain", () => {
    expect(centeredIds(["verse", "widgets", "settings"])).toEqual([
      "widgets",
      "verse",
      "settings",
    ]);
  });

  test("keeps the full five-tab order with verse in the center", () => {
    expect(
      centeredIds(["assemblies", "commentary", "verse", "widgets", "settings"]),
    ).toEqual(["assemblies", "commentary", "verse", "widgets", "settings"]);
  });

  test("balances when only commentary is closed", () => {
    expect(centeredIds(["assemblies", "verse", "widgets", "settings"])).toEqual([
      "assemblies",
      "verse",
      "widgets",
      "settings",
    ]);
  });

  test("moves extras from a heavy left side onto the right", () => {
    expect(
      centeredIds(["assemblies", "commentary", "extra", "verse", "settings"]),
    ).toEqual(["assemblies", "commentary", "verse", "extra", "settings"]);
  });
});
