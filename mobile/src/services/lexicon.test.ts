// Bun provides this test module at runtime; Expo's resolver does not index it.
// eslint-disable-next-line import/no-unresolved
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

mock.module("react-native", () => ({
	NativeModules: { SourceCode: { scriptURL: "http://localhost:8082/index.bundle" } },
	Platform: { OS: "ios" },
}));

const { loadLexiconEntryFromStatic } = await import("./lexicon");
const { resetStaticDataRequestCachesForTests } = await import("./api");

const requestedPaths: string[] = [];
let originalFetch: typeof fetch;

beforeEach(() => {
	requestedPaths.length = 0;
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
