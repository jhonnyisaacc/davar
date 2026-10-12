import { describe, expect, test } from "bun:test";
import { centerPrimaryDestination } from "./destinations";

function centeredIds(ids: readonly string[]): Array<string | null> {
  return centerPrimaryDestination(ids.map((id) => ({ id }))).map((item) => item?.id ?? null);
}

describe("centerPrimaryDestination", () => {
  test("pads closed assemblies and commentary so verse is centered", () => {
    expect(centeredIds(["verse", "widgets", "settings"])).toEqual([
      null,
      null,
      "verse",
      "widgets",
      "settings",
    ]);
  });

  test("keeps all five destinations with verse in the center and no pads", () => {
    expect(
      centeredIds(["assemblies", "commentary", "verse", "widgets", "settings"]),
    ).toEqual(["assemblies", "commentary", "verse", "widgets", "settings"]);
  });

  test("pads one side when only commentary is closed", () => {
    expect(centeredIds(["assemblies", "verse", "widgets", "settings"])).toEqual([
      null,
      "assemblies",
      "verse",
      "widgets",
      "settings",
    ]);
  });
});
