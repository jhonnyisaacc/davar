import { TS2009_BOOK_FILE_MAP } from "./ts2009BookFileMap";

export const oeChapterAssetPath = (bookId: string, chapter: number): string =>
	`oe/${bookId}/${chapter}.json`;

export const besorahChapterAssetPath = (
	bookId: string,
	chapter: number,
): string => `besorah/${bookId}/${chapter}.json`;

export const hutterChapterAssetPath = (
	bookId: string,
	chapter: number,
): string => `hutter/${bookId}/${chapter}.json`;

export const tthBookAssetPath = (bookId: string): string => `tth/${bookId}.json`;

export const besBookAssetPath = (bookId: string): string => `bes/${bookId}.json`;

export const ts2009BookFileName = (fileStem: string): string =>
	`${fileStem}.json`;

export const ts2009BookAssetPath = (fileStem: string): string =>
	`ts2009/${fileStem}.json`;

export const ts2009ApiBookPath = (fileStem: string): string =>
	`api/ts2009/${fileStem}.json`;

export const ts2009BookFileStems = (
	bookId: string,
	legacyStem?: string | null,
): string[] => {
	const normalized = bookId.toLowerCase();
	const mapped = TS2009_BOOK_FILE_MAP[normalized];
	const underscoreVariant = normalized.replace(/(\D)(\d+)$/, "$1_$2");
	const stems = [mapped, legacyStem, normalized, underscoreVariant].filter(
		(stem): stem is string => Boolean(stem),
	);

	return [...new Set(stems)];
};

export const ts2009BookLookupPaths = (
	bookId: string,
	legacyStem?: string | null,
): string[] => {
	const paths: string[] = [];
	for (const stem of ts2009BookFileStems(bookId, legacyStem)) {
		paths.push(ts2009BookFileName(stem));
		paths.push(ts2009BookAssetPath(stem));
	}

	return [...new Set(paths)];
};
