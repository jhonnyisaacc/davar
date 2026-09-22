import { describe, expect, test } from "bun:test";
import {
	LEXICON_INSTANCE_SPLIT_THRESHOLD_BYTES,
	buildLexiconAssets,
	buildLexiconEntryAsset,
	isCurrentLexiconResult,
} from "../../shared/lexiconAssets";
import { lexiconEntryShardKey } from "../../shared/staticDataPaths";
import {
	canonicalBookIdFromTranslitStem,
	splitDssBook,
	splitDssTranslitBook,
	splitTranslitBook,
} from "./chapter-assets";

describe("lexicon entry generation", () => {
	test("merges word, root, and custom definition fields", () => {
		const built = buildLexiconEntryAsset(
			"H430",
			{
				H430: {
					strong_number: "H430",
					lemma: "אֱלֹהִים",
					translit_en: "elohim",
					translit_es: "elohim",
					definitions: [
						{ text_en: "God", text_es: "Dios", source: "strong" },
					],
					root_ref: "H430",
				},
			},
			{},
			{
				H430: {
					strong_number: "H430",
					hebrew: "אֱלֹהִים",
					transliteration_en: "elohim",
					definitions: [
						{
							text_en: "mighty ones",
							text_es: "poderosos",
							source: "custom",
							review_status: "approved",
						},
					],
					root: "אֱלֹהִים",
					root_strong: "H430",
				},
			},
		);

		expect(built?.entry).toMatchObject({
			strong_number: "H430",
			hebrew: "אֱלֹהִים",
			root: "אֱלֹהִים",
			root_strong: "H430",
		});
		expect(built?.entry.definitions.map((item) => item.source)).toEqual([
			"custom",
			"strong",
		]);
		expect(built?.entry.definitions[0]?.review_status).toBe("approved");
		expect(built?.instances).toBeNull();
	});

	test("embeds referenced root data without requiring a second dictionary", () => {
		const built = buildLexiconEntryAsset(
			"H1004",
			{
				H1004: {
					strong_number: "H1004",
					lemma: "בַּיִת",
					root_ref: "H1129",
					definitions: [{ text_en: "house", source: "strong" }],
				},
			},
			{
				H1129: {
					strong_number: "H1129",
					lemma: "בָּנָה",
					translit_en: "banah",
					definitions: [{ text_en: "to build", source: "strong" }],
				},
			},
			{},
		);

		expect(built?.entry.root).toBe("בָּנָה");
		expect(built?.entry.root_strong).toBe("H1129");
		expect(built?.entry.root_translit_en).toBe("banah");
		expect(built?.entry.root_definitions?.[0]?.text_en).toBe("to build");
	});

	test("splits oversized instance payloads and keeps definition metadata", () => {
		const references = Array.from(
			{ length: 400 },
			(_, index) => `genesis.1.${index + 1}`,
		);
		const built = buildLexiconEntryAsset(
			"H853",
			{
				H853: {
					strong_number: "H853",
					lemma: "אֵת",
					occurrences: { total: references.length, references },
					definitions: [{ text_en: "direct object marker", source: "strong" }],
				},
			},
			{},
			{},
		);

		expect(
			JSON.stringify(built?.entry.instances ?? []).length,
		).toBeLessThan(LEXICON_INSTANCE_SPLIT_THRESHOLD_BYTES);
		expect(built?.entry.has_instances_asset).toBe(true);
		expect(built?.entry.occurrences_count).toBe(400);
		expect(built?.instances?.instances.length).toBeGreaterThan(0);
	});

	test("indexes source dictionaries by normalized Strong keys", () => {
		const assets = buildLexiconAssets(
			{
				h430: { strong_number: "H430", lemma: "אֱלֹהִים" },
			},
			{},
			{},
		);

		expect(assets.shards.H04.H430.strong_number).toBe("H430");
		expect(assets.skippedKeys).toEqual([]);
		expect(assets.missingStrong).toEqual([]);
	});

	test("shards by Strong family and rejects malformed keys", () => {
		const assets = buildLexiconAssets(
			{
				H430: { strong_number: "H430", lemma: "אֱלֹהִים" },
				H431: { strong_number: "H431", lemma: "אֲלוּ" },
				H7225: { strong_number: "H7225", lemma: "רֵאשִׁית" },
			},
			{},
			{
				"H1 / H2": { strong_number: "H1 / H2" },
			},
		);

		expect(Object.keys(assets.shards).sort()).toEqual(["H04", "H72"]);
		expect(assets.shards.H04.H430.strong_number).toBe("H430");
		expect(assets.shards.H04.H431.strong_number).toBe("H431");
		expect(assets.shards.H72.H7225.strong_number).toBe("H7225");
		expect(assets.skippedKeys).toEqual(["H1 / H2"]);
		expect(assets.duplicateKeys).toEqual([]);
		expect(assets.missingStrong).toEqual([]);
		expect(lexiconEntryShardKey("H430")).toBe("H04");
		expect(lexiconEntryShardKey("H7225")).toBe("H72");
	});

	test("ignores stale lexicon results from a previous Strong number", () => {
		expect(isCurrentLexiconResult("H7225", "H430")).toBe(false);
		expect(isCurrentLexiconResult("H7225", "H7225")).toBe(true);
	});
});

describe("chapter asset splitting", () => {
	test("splits transliteration by chapter and canonicalizes book stems", () => {
		expect(canonicalBookIdFromTranslitStem("isamuel")).toBe("samuel1");
		expect(canonicalBookIdFromTranslitStem("genesis")).toBe("genesis");
		expect(canonicalBookIdFromTranslitStem("benchmark")).toBeNull();

		const chapters = splitTranslitBook({
			verses: [
				{ chapter: 1, verse: 1, words: [{ text: "a" }] },
				{ chapter: 1, verse: 2, words: [{ text: "b" }] },
				{ chapter: 2, verse: 1, words: [{ text: "c" }] },
			],
		});

		expect(Object.keys(chapters)).toEqual(["1", "2"]);
		expect(chapters["1"].verses).toHaveLength(2);
		expect(chapters["2"].verses).toHaveLength(1);
	});

	test("splits DSS books and DSS transliteration by chapter", () => {
		const dss = splitDssBook({
			chapters: {
				"1": { verses: { "1": { differences: [{ position: 1 }] } } },
				"2": { verses: { "1": { differences: [] } } },
			},
		});
		expect(dss["1"]?.verses).toEqual({
			"1": { differences: [{ position: 1 }] },
		});

		const translit = splitDssTranslitBook({
			variants: [
				{ chapter: 1, verse: 1, position: 1 },
				{ chapter: 2, verse: 1, position: 1 },
			],
		});
		expect(translit["1"].variants).toHaveLength(1);
		expect(translit["2"].variants).toHaveLength(1);
	});
});
