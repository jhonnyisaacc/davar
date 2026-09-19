import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isCurrentLexiconResult } from "../../../../shared/lexiconAssets";
import {
	getChapterVerses,
	loadLexiconEntry,
	resetStaticDataCachesForTests,
} from "./staticData";

const requestedPaths = (): string[] =>
	recordedRequests.map((url) => {
		const parsed = new URL(url, "https://davar.test");
		return parsed.pathname;
	});

let recordedRequests: string[] = [];
let originalFetch: typeof fetch;

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

beforeEach(() => {
	recordedRequests = [];
	resetStaticDataCachesForTests();
	originalFetch = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		recordedRequests.push(url);
		const path = new URL(url, "https://davar.test").pathname;

		if (path.endsWith("/data/version.json")) {
			return jsonResponse({ version: "test-1" });
		}
		if (path.endsWith("/data/metadata.json")) {
			return jsonResponse({
				books: [
					{
						id: "genesis",
						name: "Genesis",
						section: "torah",
						chapters: 50,
						order: 1,
						hebrew_name: "בראשית",
						hebrew_transliteration: "Bereshit",
						spanish_name: "Génesis",
					},
				],
				verse_counts: { Genesis: { "1": 1 } },
			});
		}
		if (path.endsWith("/data/oe/genesis/1.json")) {
			return jsonResponse([
				{
					chapter: 1,
					verse: 1,
					hebrew: "בְּרֵאשִׁית",
					words: [
						{
							text: "בְּרֵאשִׁית",
							strong: "H7225",
							prefixes: [],
							translit_en: "bereshit",
						},
					],
				},
			]);
		}
		if (path.endsWith("/data/translit/genesis/1.json")) {
			return jsonResponse({
				verses: [
					{
						chapter: 1,
						verse: 1,
						words: [{ text: "בְּרֵאשִׁית", strong: "H7225", translit_en: "bereshit" }],
					},
				],
			});
		}
		if (path.endsWith("/data/dss/genesis/1.json")) {
			return jsonResponse({ verses: {} });
		}
		if (path.endsWith("/data/dict/entries/H04.json")) {
			return jsonResponse({
				H430: {
					strong_number: "H430",
					hebrew: "אֱלֹהִים",
					translit_en: "elohim",
					definitions: [{ text_en: "God", source: "custom" }],
					root: "אֱלֹהִים",
					root_strong: "H430",
					occurrences_count: 2602,
					has_instances_asset: true,
				},
			});
		}
		if (path.endsWith("/data/dict/entries/H72.json")) {
			return jsonResponse({
				H7225: {
					strong_number: "H7225",
					hebrew: "רֵאשִׁית",
					definitions: [{ text_en: "beginning", source: "strong" }],
					occurrences_count: 51,
				},
			});
		}
		if (path.endsWith("/data/dict/instances/H430.json")) {
			return jsonResponse({
				strong_number: "H430",
				instances: ["genesis 1:1"],
				occurrences_count: 2602,
			});
		}
		if (path.endsWith("/data/ts2009/genesis/1.json")) {
			return jsonResponse({
				book: "genesis",
				chapter: 1,
				verses: { "1": "In the beginning" },
			});
		}

		return jsonResponse({ error: path }, 404);
	};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetStaticDataCachesForTests();
});

describe("chapter and lexicon loaders", () => {
	test("uses chapter-scoped transliteration instead of the full book file", async () => {
		const verses = await getChapterVerses("genesis", 1, { hebrewOnly: true });
		expect(verses).toHaveLength(1);
		expect(verses[0]?.words[0]?.translit_en).toBe("bereshit");
		expect(requestedPaths()).toContain("/data/translit/genesis/1.json");
		expect(
			requestedPaths().some((path) => path === "/data/translit/genesis.json"),
		).toBe(false);
	});

	test("does not request DSS when it is disabled", async () => {
		await getChapterVerses("genesis", 1, { hebrewOnly: true, showDss: false });
		expect(requestedPaths().some((path) => path.includes("/data/dss/"))).toBe(
			false,
		);
	});

	test("single-word lookup fetches the Strong shard instead of full dictionaries", async () => {
		const entry = await loadLexiconEntry("H430", "en");
		expect(entry).toMatchObject({
			strong_number: "H430",
			hebrew: "אֱלֹהִים",
			definitions: [{ text: "God", source: "custom" }],
			has_instances_asset: true,
		});
		expect(requestedPaths()).toContain("/data/dict/entries/H04.json");
		expect(
			requestedPaths().some((path) =>
				["/data/dict/words.json", "/data/dict/roots.json", "/data/dict/custom_definitions.json"].includes(
					path,
				),
			),
		).toBe(false);
	});

	test("repeated lookups reuse the in-memory cache", async () => {
		await loadLexiconEntry("H430", "en");
		const firstCount = recordedRequests.length;
		await loadLexiconEntry("H430", "en");
		expect(recordedRequests.length).toBe(firstCount);
	});

	test("concurrent lookups share one in-flight request", async () => {
		const [first, second] = await Promise.all([
			loadLexiconEntry("H430", "en"),
			loadLexiconEntry("H430", "es"),
		]);
		expect(first?.strong_number).toBe("H430");
		expect(second?.strong_number).toBe("H430");
		expect(
			requestedPaths().filter((path) => path === "/data/dict/entries/H04.json"),
		).toHaveLength(1);
	});

	test("failed requests can retry", async () => {
		let attempts = 0;
		let shouldFail = true;
		globalThis.fetch = async (input) => {
			const url = String(input);
			recordedRequests.push(url);
			const path = new URL(url, "https://davar.test").pathname;
			if (path.endsWith("/data/version.json")) {
				return jsonResponse({ version: "test-1" });
			}
			if (path.endsWith("/data/dict/entries/H04.json")) {
				attempts += 1;
				if (shouldFail) {
					return jsonResponse({}, 500);
				}
				return jsonResponse({
					H430: {
						strong_number: "H430",
						definitions: [{ text_en: "God" }],
						occurrences_count: 1,
					},
				});
			}
			return jsonResponse({}, 404);
		};

		expect(await loadLexiconEntry("H430", "en")).toBeNull();
		shouldFail = false;
		resetStaticDataCachesForTests();
		const retried = await loadLexiconEntry("H430", "en");
		expect(retried?.strong_number).toBe("H430");
		expect(attempts).toBeGreaterThan(1);
	});

	test("stale Strong results do not replace a newer selection", () => {
		expect(isCurrentLexiconResult("H7225", "H430")).toBe(false);
		expect(isCurrentLexiconResult("H7225", "H7225")).toBe(true);
	});

	test("prefers chapter-scoped TS2009 files over the full book file", async () => {
		const verses = await getChapterVerses("genesis", 1, { language: "en" });
		expect(verses[0]?.translation).toBe("In the beginning");
		expect(requestedPaths()).toContain("/data/ts2009/genesis/1.json");
		expect(
			requestedPaths().some((path) => path === "/data/ts2009/genesis.json"),
		).toBe(false);
	});

	test("does not hydrate every BES book when metadata already has labels", async () => {
		const { getBooks } = await import("./staticData");
		await getBooks();
		expect(
			requestedPaths().some((path) => path.startsWith("/data/bes/")),
		).toBe(false);
	});

	test("appends a data version to immutable static URLs", async () => {
		await loadLexiconEntry("H430", "en");
		expect(
			recordedRequests.some((url) => url.includes("/data/dict/entries/H04.json?v=test-1")),
		).toBe(true);
	});
});
