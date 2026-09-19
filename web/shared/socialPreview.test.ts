import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	PREVIEW_IMAGE_HEIGHT,
	PREVIEW_IMAGE_PATH,
	PREVIEW_IMAGE_WIDTH,
	applySocialPreviewToHtml,
	buildPreviewMetadata,
	parseAcceptLanguage,
	parsePreviewRoute,
	shouldRewritePreviewPath,
} from "./socialPreview";

const previewOrigin = "https://feat-preview-link-v2.davar.pages.dev";
const htmlPath = join(import.meta.dir, "..", "index.html");
const imagePath = join(
	import.meta.dir,
	"..",
	"public",
	PREVIEW_IMAGE_PATH.slice(1),
);

const readPngSize = async (
	path: string,
): Promise<{ width: number; height: number }> => {
	const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		width: view.getUint32(16),
		height: view.getUint32(20),
	};
};

const meta = (
	html: string,
	attr: "property" | "name",
	key: string,
): string | null => {
	const pattern = new RegExp(
		`<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${key}["'][^>]*>`,
		"i",
	);
	const tag = html.match(pattern)?.[0];
	return tag?.match(/\bcontent\s*=\s*["']([^"']*)["']/)?.[1] ?? null;
};

const titleOf = (html: string): string | null =>
	html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;

const canonicalOf = (html: string): string | null => {
	const tag = html.match(
		/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i,
	)?.[0];
	return tag?.match(/\bhref\s*=\s*["']([^"']*)["']/)?.[1] ?? null;
};

describe("social preview routes", () => {
	test("classifies homepage, scripture, word, search, and unknown paths", () => {
		expect(parsePreviewRoute("https://davar.bible/")).toEqual({ kind: "home" });
		expect(parsePreviewRoute("https://davar.bible/home")).toEqual({
			kind: "home",
		});
		expect(parsePreviewRoute("https://davar.bible/verse/Genesis")).toEqual({
			kind: "verse",
			book: "Genesis",
			chapter: undefined,
			verse: undefined,
		});
		expect(parsePreviewRoute("https://davar.bible/verse/Genesis/1")).toEqual({
			kind: "verse",
			book: "Genesis",
			chapter: 1,
			verse: undefined,
		});
		expect(parsePreviewRoute("https://davar.bible/verse/Genesis/1/1")).toEqual({
			kind: "verse",
			book: "Genesis",
			chapter: 1,
			verse: 1,
		});
		expect(parsePreviewRoute("https://davar.bible/word/H7225")).toEqual({
			kind: "word",
			word: "H7225",
		});
		expect(parsePreviewRoute("https://davar.bible/search?q=light")).toEqual({
			kind: "search",
			query: "light",
		});
		expect(parsePreviewRoute("https://davar.bible/not-a-route")).toEqual({
			kind: "fallback",
		});
	});

	test("ignores unsafe word tokens and unknown books with invalid references", () => {
		expect(parsePreviewRoute("https://davar.bible/word/<script>")).toEqual({
			kind: "fallback",
		});
		expect(
			parsePreviewRoute("https://davar.bible/verse/Genesis/nope/1"),
		).toEqual({
			kind: "fallback",
		});
	});
});

describe("social preview metadata", () => {
	test("homepage uses the Scripture image and purpose-oriented copy", () => {
		const metadata = buildPreviewMetadata({
			requestUrl: `${previewOrigin}/`,
			acceptLanguage: "en-US",
		});

		expect(metadata.title).toBe("Davar | Hebrew Scriptures");
		expect(metadata.description).toContain("original languages");
		expect(metadata.description).not.toMatch(/Strong/i);
		expect(metadata.ogUrl).toBe("https://davar.bible/");
		expect(metadata.canonicalUrl).toBe("https://davar.bible/");
		expect(metadata.ogImage).toBe(`${previewOrigin}${PREVIEW_IMAGE_PATH}`);
		expect(metadata.twitterImage).toBe(metadata.ogImage);
		expect(metadata.twitterCard).toBe("summary_large_image");
		expect(metadata.ogImage.startsWith("https://")).toBe(true);
	});

	test("verse, chapter, and word routes keep production canonicals", () => {
		const verse = buildPreviewMetadata({
			requestUrl: `${previewOrigin}/verse/Genesis/1/1`,
		});
		expect(verse.title).toBe("Genesis 1:1 — Davar");
		expect(verse.description).toContain("Genesis 1:1");
		expect(verse.ogUrl).toBe("https://davar.bible/verse/Genesis/1/1");
		expect(verse.ogImage).toBe(`${previewOrigin}${PREVIEW_IMAGE_PATH}`);

		const chapter = buildPreviewMetadata({
			requestUrl: `${previewOrigin}/verse/Psalms/23`,
		});
		expect(chapter.title).toBe("Psalms 23 — Davar");
		expect(chapter.ogUrl).toBe("https://davar.bible/verse/Psalms/23");

		const word = buildPreviewMetadata({
			requestUrl: `${previewOrigin}/word/H7225`,
		});
		expect(word.title).toBe("H7225 — Davar");
		expect(word.description).not.toMatch(/Strong/i);
		expect(word.ogUrl).toBe("https://davar.bible/word/H7225");
	});

	test("unknown routes fall back to generic Davar metadata", () => {
		const metadata = buildPreviewMetadata({
			requestUrl: `${previewOrigin}/missing-book/99/99`,
		});
		expect(metadata.title).toBe("Davar | Hebrew Scriptures");
		expect(metadata.canonicalUrl).toBe("https://davar.bible/");
		expect(metadata.ogImage).toBe(`${previewOrigin}${PREVIEW_IMAGE_PATH}`);
	});

	test("localizes crawler copy from Accept-Language, not the browser", () => {
		expect(parseAcceptLanguage("es-419,es;q=0.9")).toBe("es");
		const spanish = buildPreviewMetadata({
			requestUrl: "https://davar.bible/home",
			acceptLanguage: "es-ES,es;q=0.8",
		});
		expect(spanish.title).toBe("Davar | Escrituras Hebreas");
		expect(spanish.description).toContain("lenguas originales");
		expect(spanish.ogLocale).toBe("es_ES");

		const hebrew = buildPreviewMetadata({
			requestUrl: "https://davar.bible/verse/Genesis/1/1",
			acceptLanguage: "he",
		});
		expect(hebrew.title).toBe("Genesis 1:1 — דבר");
		expect(hebrew.description).toContain("בדבר");
	});
});

describe("crawler-facing HTML", () => {
	test("source homepage HTML already contains crawler metadata without JavaScript", async () => {
		const html = await Bun.file(htmlPath).text();

		expect(html).not.toContain("og-image.png");
		expect(html).not.toMatch(/Strong['’]?s/i);
		expect(html).not.toContain("document.getElementById(");
		expect(titleOf(html)).toBe("Davar | Hebrew Scriptures");
		expect(meta(html, "property", "og:title")).toBe(
			"Davar | Hebrew Scriptures",
		);
		expect(meta(html, "property", "og:description")).toContain(
			"original languages",
		);
		expect(meta(html, "property", "og:url")).toBe("https://davar.bible/");
		expect(meta(html, "property", "og:image")).toBe(
			`https://davar.bible${PREVIEW_IMAGE_PATH}`,
		);
		expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
		expect(meta(html, "name", "twitter:title")).toBe(
			"Davar | Hebrew Scriptures",
		);
		expect(meta(html, "name", "twitter:description")).toContain(
			"original languages",
		);
		expect(meta(html, "name", "twitter:image")).toBe(
			`https://davar.bible${PREVIEW_IMAGE_PATH}`,
		);
		expect(canonicalOf(html)).toBe("https://davar.bible/");
	});

	test("rewrites representative routes in the initial HTML string", async () => {
		const source = await Bun.file(htmlPath).text();
		const cases = [
			{
				requestUrl: `${previewOrigin}/`,
				title: "Davar | Hebrew Scriptures",
				url: "https://davar.bible/",
			},
			{
				requestUrl: `${previewOrigin}/verse/Genesis/1`,
				title: "Genesis 1 — Davar",
				url: "https://davar.bible/verse/Genesis/1",
			},
			{
				requestUrl: `${previewOrigin}/verse/Genesis/1/1`,
				title: "Genesis 1:1 — Davar",
				url: "https://davar.bible/verse/Genesis/1/1",
			},
			{
				requestUrl: `${previewOrigin}/word/H7225`,
				title: "H7225 — Davar",
				url: "https://davar.bible/word/H7225",
			},
			{
				requestUrl: `${previewOrigin}/unknown-data`,
				title: "Davar | Hebrew Scriptures",
				url: "https://davar.bible/",
			},
		];

		for (const fixture of cases) {
			const rewritten = applySocialPreviewToHtml(
				source,
				buildPreviewMetadata({ requestUrl: fixture.requestUrl }),
			);

			expect(rewritten).not.toContain("og-image.png");
			expect(rewritten).not.toMatch(/Strong['’]?s/i);
			expect(titleOf(rewritten)).toBe(fixture.title);
			expect(meta(rewritten, "property", "og:title")).toBe(fixture.title);
			expect(meta(rewritten, "property", "og:url")).toBe(fixture.url);
			expect(meta(rewritten, "property", "og:image")).toBe(
				`${previewOrigin}${PREVIEW_IMAGE_PATH}`,
			);
			expect(meta(rewritten, "name", "twitter:card")).toBe(
				"summary_large_image",
			);
			expect(meta(rewritten, "name", "twitter:title")).toBe(fixture.title);
			expect(meta(rewritten, "name", "twitter:image")).toBe(
				`${previewOrigin}${PREVIEW_IMAGE_PATH}`,
			);
			expect(canonicalOf(rewritten)).toBe(fixture.url);
			expect(rewritten).toContain(`hreflang="en" href="${fixture.url}"`);
		}
	});

	test("does not rewrite API or static asset paths", () => {
		expect(shouldRewritePreviewPath("/api/ts2009/genesis.json")).toBe(false);
		expect(shouldRewritePreviewPath("/og-preview-genesis-1-1.png")).toBe(false);
		expect(shouldRewritePreviewPath("/data/metadata.json")).toBe(false);
		expect(shouldRewritePreviewPath("/verse/Genesis/1/1")).toBe(true);
	});
});

describe("preview image asset", () => {
	test("commits a reachable Open Graph-sized PNG", async () => {
		const file = Bun.file(imagePath);
		expect(await file.exists()).toBe(true);
		expect(file.type).toBe("image/png");

		const { width, height } = await readPngSize(imagePath);
		expect(width).toBe(PREVIEW_IMAGE_WIDTH);
		expect(height).toBe(PREVIEW_IMAGE_HEIGHT);
		expect(PREVIEW_IMAGE_PATH.startsWith("/")).toBe(true);
	});
});
