import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  I18nManager: { isRTL: false },
  Platform: {
    OS: "ios",
    select: (spec: { ios?: unknown; default?: unknown }) =>
      spec.ios ?? spec.default,
  },
}));

const { getColors, themeModeFromToggle } = await import("./theme");

describe("hebrew source color", () => {
  test("uses black in light and parchment in dark, distinct from translated text", () => {
    expect(getColors("light").textHebrew).toBe("#000000");
    expect(getColors("dark").textHebrew).toBe("#d5c4a1");
    expect(getColors("dark").textHebrew).not.toBe(
      getColors("dark").textPrimary,
    );
  });
});

describe("themeModeFromToggle", () => {
  test("maps the switch to an absolute theme mode", () => {
    expect(themeModeFromToggle(true)).toBe("dark");
    expect(themeModeFromToggle(false)).toBe("light");
  });
});
