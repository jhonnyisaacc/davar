import {
	DELITZSCH_TO_ENGLISH,
	OE_TO_ENGLISH,
} from "./config";

type JsonRecord = Record<string, unknown>;

const SKIP_TRANSLIT_STEMS = new Set([
	"benchmark",
	"dss_transformation_report",
]);

export const canonicalBookIdFromTranslitStem = (
	stem: string,
): string | null => {
	const normalized = stem.toLowerCase();
	if (SKIP_TRANSLIT_STEMS.has(normalized)) {
		return null;
	}

	const oe = OE_TO_ENGLISH[normalized];
	if (oe) return oe.toLowerCase();

	const delitzsch = DELITZSCH_TO_ENGLISH[normalized];
	if (delitzsch) return delitzsch.toLowerCase();

	return normalized;
};

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const splitTranslitBook = (
	book: unknown,
): Record<string, { verses: unknown[] }> => {
	if (!isRecord(book) || !Array.isArray(book.verses)) {
		return {};
	}

	const chapters: Record<string, { verses: unknown[] }> = {};
	for (const verse of book.verses) {
		if (!isRecord(verse)) continue;
		const chapter = Number(verse.chapter);
		if (!Number.isFinite(chapter) || chapter <= 0) continue;
		const key = String(chapter);
		if (!chapters[key]) {
			chapters[key] = { verses: [] };
		}
		chapters[key].verses.push(verse);
	}

	return chapters;
};

export const splitDssBook = (
	book: unknown,
): Record<string, { verses: unknown }> => {
	if (!isRecord(book) || !isRecord(book.chapters)) {
		return {};
	}

	const chapters: Record<string, { verses: unknown }> = {};
	for (const [chapterKey, chapterValue] of Object.entries(book.chapters)) {
		if (!isRecord(chapterValue)) continue;
		chapters[chapterKey] = {
			verses: chapterValue.verses ?? {},
		};
	}

	return chapters;
};

export const splitDssTranslitBook = (
	book: unknown,
): Record<string, { variants: unknown[] }> => {
	if (!isRecord(book) || !Array.isArray(book.variants)) {
		return {};
	}

	const chapters: Record<string, { variants: unknown[] }> = {};
	for (const variant of book.variants) {
		if (!isRecord(variant)) continue;
		const chapter = Number(variant.chapter);
		if (!Number.isFinite(chapter) || chapter <= 0) continue;
		const key = String(chapter);
		if (!chapters[key]) {
			chapters[key] = { variants: [] };
		}
		chapters[key].variants.push(variant);
	}

	return chapters;
};
