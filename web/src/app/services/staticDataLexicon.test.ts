import { afterEach, beforeEach, expect, test } from "bun:test";
import { lexiconEntryAssetPath } from "../../../../shared/staticDataPaths";
import { loadRelatedGloss } from "./staticDataLexicon";

const STRONG = "H9911";
const MISSING_STRONG = "H9912";
let originalFetch: typeof fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes(lexiconEntryAssetPath(STRONG))) {
			return new Response(
				JSON.stringify({
					[STRONG]: {
						strong_number: STRONG,
						definitions: [
							{ text_en: "Fixture words", source: "custom" },
							{ text_es: "Palabras", source: "custom" },
						],
						occurrences_count: 0,
					},
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}
		return new Response("missing", { status: 404 });
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("returns the first gloss in the requested language", async () => {
	expect(await loadRelatedGloss(STRONG, "es")).toBe("Palabras");
	expect(await loadRelatedGloss(STRONG, "en")).toBe("Fixture words");
});

test("Hebrew has no English fallback", async () => {
	expect(await loadRelatedGloss(STRONG, "he")).toBeNull();
});

test("a missing asset yields no gloss", async () => {
	expect(await loadRelatedGloss(MISSING_STRONG, "es")).toBeNull();
});
