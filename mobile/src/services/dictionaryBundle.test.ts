// Bun provides this test module at runtime; Expo's resolver does not index it.
// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from "bun:test";
import {
  buildLexiconEntries,
  type DictionaryBundle,
} from "./dictionaryBundle";

const fileJson = async <T>(relativePath: string): Promise<T> =>
  Bun.file(new URL(`../../../${relativePath}`, import.meta.url)).json() as Promise<T>;

describe("dictionary bundle normalization", () => {
  test("merges custom and canonical root rows without collapsing contextual definitions", () => {
    const bundle: DictionaryBundle = {
      custom_definitions: {
        H3372: {
          strong_number: "H3372",
          definitions: [
            { text_es: "authored", source: "custom" },
            { text_es: "context one", source: "tcysite-eric" },
            { text_es: "context two", source: "tcysite-eric" },
          ],
          root: "custom root",
        },
      },
      roots: {
        H3372: {
          strong_number: "H3372",
          lemma: "יָרֵא",
          transliteration: "yare",
          definitions: [{ text_es: "canonical", source: "bdb" }],
          root: "canonical root",
          occurrences_count: 12,
        },
      },
      prefixes: {},
    };

    const entries = buildLexiconEntries(bundle);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      strong_number: "H3372",
      hebrew: "יָרֵא",
      root: "custom root",
      occurrences_count: 12,
    });
    expect(entries[0].definitions.map((item) => item.text)).toEqual([
      "authored",
      "context one",
      "context two",
      "canonical",
    ]);
  });

  test("preserves every imported definition on the affected root overlaps", async () => {
    const custom = await fileJson<DictionaryBundle["custom_definitions"]>(
      "data/dict/lexicon/custom_definitions.json",
    );
    const roots = await fileJson<DictionaryBundle["roots"]>(
      "data/dict/lexicon/roots.json",
    );
    const entries = buildLexiconEntries({ custom_definitions: custom, roots, prefixes: {} });
    const byStrong = new Map(entries.map((entry) => [entry.strong_number, entry]));
    const overlapping = Object.keys(custom).filter((strong) => strong in roots);
    const importedOverlaps = overlapping.filter((strong) =>
      custom[strong].definitions.some((item) =>
        item.source?.startsWith("tcysite-"),
      ),
    );
    const importedDefinitionCount = importedOverlaps.reduce(
      (total, strong) =>
        total +
        custom[strong].definitions.filter((item) =>
          item.source?.startsWith("tcysite-"),
        ).length,
      0,
    );

    expect(new Set(entries.map((entry) => entry.strong_number)).size).toBe(
      entries.length,
    );
    expect(importedOverlaps).toHaveLength(49);
    expect(importedDefinitionCount).toBe(84);
    expect(importedOverlaps.every((strong) => byStrong.has(strong))).toBe(true);
  });
});
