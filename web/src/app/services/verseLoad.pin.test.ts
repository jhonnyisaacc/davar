import { afterEach, beforeEach, expect, test } from "bun:test";
import { getVerse, resetStaticDataCachesForTests } from "./staticData";

const dataRoot = new URL("../../../../data/", import.meta.url);

const pinShape = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(pinShape);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value).map((key) => {
				const item = (value as Record<string, unknown>)[key];
				return [key, item === undefined ? "__UNDEFINED__" : pinShape(item)];
			}),
		);
	}
	return value;
};

let originalFetch: typeof fetch;

const setTestFetch = (
	handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) => {
	globalThis.fetch = Object.assign(handler, {
		preconnect: originalFetch.preconnect,
	});
};

beforeEach(() => {
	resetStaticDataCachesForTests();
	originalFetch = globalThis.fetch;
	setTestFetch(async (input) => {
		const url = new URL(String(input), "https://davar.test");
		const pathname = decodeURIComponent(url.pathname);
		if (pathname.endsWith("/version.json")) {
			return new Response("missing", { status: 404 });
		}
		if (pathname.endsWith("/metadata.json")) {
			return Response.json({
				books: [
					{
						id: "psalms",
						name: "Psalms",
						section: "ketuvim",
						chapters: 150,
						order: 27,
						hebrew_name: "תהלים",
						hebrew_transliteration: "Tehilim",
						spanish_name: "Salmos",
					},
				],
			});
		}
		const marker = "/data/";
		const index = pathname.lastIndexOf(marker);
		if (index === -1) {
			return new Response("missing", { status: 404 });
		}
		const relative = pathname.slice(index + marker.length);
		const file = Bun.file(new URL(relative, dataRoot));
		if (!(await file.exists())) {
			return new Response("missing", { status: 404 });
		}
		return new Response(await file.text(), {
			headers: { "content-type": "application/json" },
		});
	});
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetStaticDataCachesForTests();
});

test("psalms 117:1 web verse load", async () => {
	const verse = await getVerse("psalms", 117, 1, { hebrewOnly: true });
	const golden = await Bun.file(
		new URL("./psalms117Verse.pin.json", import.meta.url),
	).json();
	expect(pinShape(verse)).toEqual(golden);
});
