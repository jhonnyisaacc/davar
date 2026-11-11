// Bun provides this test module at runtime; Expo's resolver does not index it.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

mock.module("react-native", () => ({
	NativeModules: { SourceCode: { scriptURL: "http://localhost:8081/index.bundle" } },
	Platform: { OS: "ios" },
}));

type OfflineRow = { definitions: unknown[] } | null;
let offlineRow: OfflineRow = null;
let offlineCalls = 0;

mock.module("@/src/services/database", () => ({
	fetchLexiconEntry: async () => {
		offlineCalls += 1;
		return offlineRow;
	},
}));

const { loadLexiconEntryFromStatic, loadRelatedGloss } = await import(
	"./lexicon"
);
const { buildLexiconEntries } = await import("./dictionaryBundle");
const { resetStaticDataRequestCachesForTests } = await import("./api");

const FIXTURE_DEFINITIONS = [
	{ text_en: "Fixture words", source: "custom" },
	{ text_es: "Palabras", source: "custom" },
	{ text_es: "Segunda glosa", source: "custom" },
];

const requestedPaths: string[] = [];
let originalFetch: typeof fetch;

beforeEach(() => {
	requestedPaths.length = 0;
	offlineRow = null;
	offlineCalls = 0;
	resetStaticDataRequestCachesForTests();
	originalFetch = globalThis.fetch;
	const mockedFetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		requestedPaths.push(url);
		if (url.includes("dict/entries/H04.json")) {
			return new Response(
				JSON.stringify({
					H430: {
						strong_number: "H430",
						hebrew: "אֱלֹהִים",
						definitions: [{ text_en: "God", source: "custom" }],
						occurrences_count: 10,
						instances: ["genesis 1:1"],
					},
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}
		if (url.includes("dict/entries/H99.json")) {
			return new Response(
				JSON.stringify({
					H9921: {
						strong_number: "H9921",
						definitions: FIXTURE_DEFINITIONS,
						occurrences_count: 0,
						instances: [],
					},
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}
		if (url.includes("version.json")) {
			return new Response(JSON.stringify({ version: "test-1" }), {
				headers: { "content-type": "application/json" },
			});
		}
		return new Response("missing", { status: 404 });
	}) as typeof fetch;
	globalThis.fetch = mockedFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetStaticDataRequestCachesForTests();
});

describe("mobile lexicon loader", () => {
	test("loads a Strong shard instead of the full dictionaries", async () => {
		const entry = await loadLexiconEntryFromStatic("H430", "en");
		expect(entry).toMatchObject({
			strong_number: "H430",
			hebrew: "אֱלֹהִים",
			occurrences_count: 10,
		});
		expect(requestedPaths.some((url) => url.includes("dict/words.json"))).toBe(
			false,
		);
		expect(
			requestedPaths.some((url) => url.includes("dict/entries/H04.json")),
		).toBe(true);
	});

	test("repeated lookups reuse the in-memory cache", async () => {
		await loadLexiconEntryFromStatic("H430", "en");
		const firstCount = requestedPaths.length;
		await loadLexiconEntryFromStatic("H430", "en");
		expect(requestedPaths.length).toBe(firstCount);
	});

	test("concurrent lookups share one in-flight request", async () => {
		const [first, second] = await Promise.all([
			loadLexiconEntryFromStatic("H430", "en"),
			loadLexiconEntryFromStatic("H430", "es"),
		]);
		expect(first?.strong_number).toBe("H430");
		expect(second?.strong_number).toBe("H430");
		expect(
			requestedPaths.filter((url) => url.includes("dict/entries/H04.json")),
		).toHaveLength(1);
	});
});

describe("related gloss", () => {
	test("online reads the asset in the requested language", async () => {
		expect(await loadRelatedGloss("H9921", "es")).toBe("Palabras");
		expect(offlineCalls).toBe(0);
	});

	test("an online entry with no gloss in the language is final", async () => {
		offlineRow = {
			definitions: [{ text: "Offline he", source: "custom", language: "he" }],
		};
		expect(await loadRelatedGloss("H9921", "he")).toBeNull();
		expect(offlineCalls).toBe(0);
	});

	test("a failed fetch reads SQLite and filters by language", async () => {
		offlineRow = {
			definitions: [
				{ text: "Offline en", source: "custom", language: "en" },
				{ text: "Offline es", source: "custom", language: "es" },
			],
		};
		expect(await loadRelatedGloss("H9931", "es")).toBe("Offline es");
		expect(await loadRelatedGloss("H9931", "he")).toBeNull();
		expect(offlineCalls).toBe(2);
	});

	test("no row anywhere yields no gloss", async () => {
		expect(await loadRelatedGloss("H9931", "es")).toBeNull();
	});

	test("bundle rows and the asset agree on the first gloss", async () => {
		const [row] = buildLexiconEntries({
			custom_definitions: {
				H9921: { strong_number: "H9921", definitions: FIXTURE_DEFINITIONS },
			},
			roots: {},
			prefixes: {},
		});
		for (const language of ["en", "es", "he"] as const) {
			const online = await loadRelatedGloss("H9921", language);
			offlineRow = { definitions: row.definitions };
			expect(await loadRelatedGloss("H9931", language)).toBe(online);
		}
	});
});
