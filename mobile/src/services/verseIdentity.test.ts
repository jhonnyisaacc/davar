// Bun supplies this runtime module; Expo lint does not resolve it.
// eslint-disable-next-line import/no-unresolved
import { expect, test } from "bun:test";

import { toDisplayVerseId } from "./verseIdentity";

test("uses a canonical navigation ID for source-local verse IDs", () => {
  expect(toDisplayVerseId("matthew", 1, 1)).toBe("matthew-1-1");
  expect(toDisplayVerseId("john1", 1, 10)).toBe("john1-1-10");
});
