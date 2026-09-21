import { expect, test } from "bun:test";
import cases from "../../../data/knowledge/registries/reference-mappings.json";
import { resolveTranslationTarget } from "../../../shared/translationConfig";

test("pilot mapping registry matches unchanged legacy translation behavior", () => {
  for (const entry of cases.legacy_translation_cases) {
    for (const language of ["en", "es"] as const) {
      const actual = resolveTranslationTarget(entry.book_id, entry.chapter, entry.verse, { language });
      expect(actual.reference).toEqual(entry.target);
      expect(actual.usesPsalmTitle).toBe(entry.uses_title);
    }
  }
});
