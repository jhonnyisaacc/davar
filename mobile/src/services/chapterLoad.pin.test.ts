import { afterEach, beforeEach, expect, mock, test } from "bun:test";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

mock.module("react-native", () => ({
	NativeModules: {
		SourceCode: { scriptURL: "http://localhost:8081/index.bundle" },
	},
	Platform: { OS: "ios" },
}));

mock.module("expo-sqlite", () => ({
	openDatabaseAsync: async () => {
		throw new Error("sqlite unused");
	},
}));

const { fetchChapterVerses } = await import("./scripture");
const { resetStaticDataRequestCachesForTests } = await import("./api");

const dataRoot = new URL("../../../data/", import.meta.url);

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

beforeEach(() => {
	resetStaticDataRequestCachesForTests();
	originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "https://davar.test");
		const pathname = decodeURIComponent(url.pathname);
		if (pathname.endsWith("/version.json")) {
			return new Response("missing", { status: 404 });
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
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetStaticDataRequestCachesForTests();
});

test("psalms 117 mobile chapter load", async () => {
	const chapter = await fetchChapterVerses("psalms", 117, { hebrewOnly: true });
	const golden = await Bun.file(
		new URL("./psalms117Chapter.pin.json", import.meta.url),
	).json();
	expect(pinShape(chapter)).toEqual(golden);
});
