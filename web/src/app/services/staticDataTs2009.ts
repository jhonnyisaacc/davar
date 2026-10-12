import {
	ts2009ApiBookPath,
	ts2009BookAssetPath,
	ts2009BookFileStems,
} from "../../../../shared/scripturePaths";
import { ts2009ChapterAssetPath } from "../../../../shared/staticDataPaths";
import { VERSIFICATION_DATA } from "../../../../shared/versificationData";
import { fetchJson } from "./staticDataFetch";

// In-memory cache for TS2009 translations to avoid repeated private API reads.
// Keys: `${bookId}:${chapter}:${verse}`, Values: string | null
const ts2009Cache = new Map<string, string | null>();
const ts2009ChapterCache = new Map<
	string,
	Promise<Map<number, string> | null>
>();
const ts2009BookFileCache = new Map<
	string,
	Promise<RawTs2009BookPayload | null>
>();
let ts2009ChapterFilesUnavailable = false;

type RawTs2009BookVerse = {
	number?: number;
	verse?: number;
	translation?: unknown;
	text?: unknown;
};

type RawTs2009BookChapter = {
	number?: number;
	chapter?: number;
	verses?: RawTs2009BookVerse[];
};

type RawTs2009BookPayload = {
	chapters?:
		| RawTs2009BookChapter[]
		| Record<string, RawTs2009BookChapter | RawTs2009BookVerse[]>;
};

const parseTs2009BookVerseText = (verse: RawTs2009BookVerse): string | null => {
	if (typeof verse.translation === "string") return verse.translation;
	if (typeof verse.text === "string") return verse.text;
	return null;
};

const extractTs2009ChapterVersesFromBook = (
	payload: RawTs2009BookPayload,
	chapter: number,
): RawTs2009BookVerse[] | null => {
	const chapters = payload.chapters;
	if (!chapters) return null;

	if (Array.isArray(chapters)) {
		const chapterMatch = chapters.find((entry) => {
			const chapterNumber = Number(entry.number ?? entry.chapter ?? Number.NaN);
			return Number.isFinite(chapterNumber) && chapterNumber === chapter;
		});

		return Array.isArray(chapterMatch?.verses) ? chapterMatch.verses : null;
	}

	const chapterEntry = chapters[String(chapter)];
	if (Array.isArray(chapterEntry)) {
		return chapterEntry;
	}

	return Array.isArray(chapterEntry?.verses) ? chapterEntry.verses : null;
};

const normalizePsalmsTs2009VerseMap = (
	chapter: number,
	verseMap: Record<string, string>,
): Record<string, string> => {
	const psaMap = VERSIFICATION_DATA.PSA?.simple_map;
	if (!psaMap) return verseMap;

	const chapterMap = (psaMap as Record<string, Record<string, string>>)[
		String(chapter)
	];
	if (!chapterMap) return verseMap;

	const targetForEnglishVerse1 = chapterMap["1"];
	if (!targetForEnglishVerse1) return verseMap;

	const [, targetVerseToken] = targetForEnglishVerse1.split(":");
	const firstRealHebrewVerse = Number(targetVerseToken);
	if (!Number.isFinite(firstRealHebrewVerse) || firstRealHebrewVerse <= 1) {
		return verseMap;
	}

	const superscriptionCount = firstRealHebrewVerse - 1;
	const englishVerseCount = Object.keys(chapterMap).filter(
		(verseKey) => Number(verseKey) > 0,
	).length;
	const existingKeys = Object.keys(verseMap)
		.map(Number)
		.filter((value) => Number.isFinite(value))
		.sort((a, b) => a - b);

	if (existingKeys.length !== englishVerseCount + superscriptionCount) {
		return verseMap;
	}

	const normalized: Record<string, string> = {};
	const realVerseKeys = existingKeys.slice(superscriptionCount);
	for (const [index, hebrewKey] of realVerseKeys.entries()) {
		const englishVerse = index + 1;
		const text = verseMap[String(hebrewKey)];
		if (text !== undefined) {
			normalized[String(englishVerse)] = text;
		}
	}

	return normalized;
};

const loadTs2009BookFile = (
	fileStem: string,
): Promise<RawTs2009BookPayload | null> => {
	let bookPromise = ts2009BookFileCache.get(fileStem);
	if (!bookPromise) {
		bookPromise = (async () => {
			const candidatePaths = [
				`/${ts2009ApiBookPath(fileStem)}`,
				`/data/${ts2009BookAssetPath(fileStem)}`,
			];

			for (const candidatePath of candidatePaths) {
				try {
					return await fetchJson<RawTs2009BookPayload>(candidatePath);
				} catch {
					// Try the next published location.
				}
			}

			return null;
		})();
		ts2009BookFileCache.set(fileStem, bookPromise);
	}

	return bookPromise;
};

const loadTs2009ChapterFromChapterFile = async (
	bookId: string,
	chapter: number,
): Promise<Map<number, string> | null> => {
	try {
		const staticChapter = await fetchJson<{
			verses?: Record<string, string>;
		}>(`/data/${ts2009ChapterAssetPath(bookId, chapter)}`);
		const verses = staticChapter.verses ?? {};
		const verseMap = new Map<number, string>();
		for (const [verseKey, translation] of Object.entries(verses)) {
			const verseNumber = Number(verseKey);
			if (Number.isFinite(verseNumber) && typeof translation === "string") {
				verseMap.set(verseNumber, translation);
			}
		}
		return verseMap.size > 0 ? verseMap : null;
	} catch {
		// Chapter files are unpublished. Later chapters go straight to the book file.
		ts2009ChapterFilesUnavailable = true;
		return null;
	}
};

const loadTs2009ChapterFromBookFile = async (
	bookId: string,
	chapter: number,
): Promise<Map<number, string> | null> => {
	if (!ts2009ChapterFilesUnavailable) {
		const chapterFile = await loadTs2009ChapterFromChapterFile(bookId, chapter);
		if (chapterFile) {
			return chapterFile;
		}
	}

	for (const fileStem of ts2009BookFileStems(bookId)) {
		const staticBook = await loadTs2009BookFile(fileStem);
		if (!staticBook) {
			continue;
		}

		const chapterVerses = extractTs2009ChapterVersesFromBook(
			staticBook,
			chapter,
		);
		if (!chapterVerses || chapterVerses.length === 0) {
			continue;
		}

		const rawVerseMap: Record<string, string> = {};
		for (const [index, verse] of chapterVerses.entries()) {
			const verseNumber = Number(verse.number ?? verse.verse ?? index + 1);
			const verseText = parseTs2009BookVerseText(verse);
			if (!Number.isFinite(verseNumber) || !verseText) {
				continue;
			}

			rawVerseMap[String(verseNumber)] = verseText;
		}

		const normalizedVerseMap =
			bookId.toLowerCase() === "psalms"
				? normalizePsalmsTs2009VerseMap(chapter, rawVerseMap)
				: rawVerseMap;

		const verseMap = new Map<number, string>();
		for (const [verseKey, verseText] of Object.entries(normalizedVerseMap)) {
			const verseNumber = Number(verseKey);
			if (!Number.isFinite(verseNumber)) {
				continue;
			}

			verseMap.set(verseNumber, verseText);
		}

		if (verseMap.size > 0) {
			return verseMap;
		}
	}

	return null;
};

/**
 * Fetches TS2009 translation with client-side caching to avoid repeated API requests.
 * Uses in-memory cache with keys formatted as `${bookId}:${chapter}:${verse}`.
 */
export const fetchCachedTs2009Translation = async (
	bookId: string,
	chapter: number,
	verse: number,
): Promise<string | null> => {
	const cacheKey = `${bookId}:${chapter}:${verse}`;

	// Return cached value if available
	if (ts2009Cache.has(cacheKey)) {
		// biome-ignore lint/style/noNonNullAssertion: safe — guarded by .has() check above
		return ts2009Cache.get(cacheKey)!;
	}

	const chapterKey = `${bookId}:${chapter}`;

	let chapterPromise = ts2009ChapterCache.get(chapterKey);
	if (!chapterPromise) {
		chapterPromise = loadTs2009ChapterFromBookFile(bookId, chapter);

		ts2009ChapterCache.set(chapterKey, chapterPromise);
	}

	const staticChapterTranslations = await chapterPromise;
	const staticTranslation = staticChapterTranslations?.get(verse) ?? null;
	if (staticTranslation) {
		ts2009Cache.set(cacheKey, staticTranslation);
		return staticTranslation;
	}

	ts2009Cache.set(cacheKey, null);
	return null;
};

export const resetTs2009Caches = (): void => {
	ts2009ChapterFilesUnavailable = false;
	ts2009Cache.clear();
	ts2009ChapterCache.clear();
	ts2009BookFileCache.clear();
};
