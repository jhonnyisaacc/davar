const STRONG_PATTERN = /^[HGD]\d+$/;

export const STATIC_DATA_VERSION_PATH = "data/version.json";
export const LEXICON_ENTRY_DIR = "dict/entries";
export const LEXICON_INSTANCE_DIR = "dict/instances";

export const DSS_BOOK_KEY_ALIASES: Record<string, string> = {
	samuel1: "1samuel",
	samuel2: "2samuel",
	songofsolomon: "songs",
	hosea: "hoseah",
};

export const TRANSLIT_BOOK_FILE_ALIASES: Record<string, string> = {
	samuel1: "isamuel",
	samuel2: "iisamuel",
	kings1: "ikings",
	kings2: "iikings",
	chronicles1: "ichronicles",
	chronicles2: "iichronicles",
};

export const normalizeStrongNumber = (
	strong?: string | null,
): string | null => {
	if (!strong) return null;
	const cleaned = strong.trim().toUpperCase();
	return STRONG_PATTERN.test(cleaned) ? cleaned : null;
};

export const lexiconEntryShardKey = (strong: string): string => {
	const normalized = normalizeStrongNumber(strong) ?? strong.trim().toUpperCase();
	const letter = /^[HGD]/.test(normalized) ? normalized[0] : "H";
	const digits = (normalized.match(/\d+/)?.[0] ?? "0").padStart(4, "0");
	return `${letter}${digits.slice(0, 2)}`;
};

export const lexiconEntryAssetPath = (strong: string): string =>
	`${LEXICON_ENTRY_DIR}/${lexiconEntryShardKey(strong)}.json`;

export const lexiconInstancesAssetPath = (strong: string): string => {
	const normalized = normalizeStrongNumber(strong) ?? strong.trim().toUpperCase();
	return `${LEXICON_INSTANCE_DIR}/${normalized}.json`;
};

export const toDssBookKey = (bookId: string): string =>
	DSS_BOOK_KEY_ALIASES[bookId] ?? bookId;

export const translitBookFileStem = (bookId: string): string =>
	TRANSLIT_BOOK_FILE_ALIASES[bookId] ?? bookId;

export const translitChapterAssetPath = (
	bookId: string,
	chapter: number,
): string => `translit/${bookId}/${chapter}.json`;

export const translitBookAssetPath = (bookId: string): string =>
	`translit/${translitBookFileStem(bookId)}.json`;

export const dssChapterAssetPath = (bookId: string, chapter: number): string =>
	`dss/${toDssBookKey(bookId)}/${chapter}.json`;

export const dssBookAssetPath = (bookId: string): string =>
	`dss/${toDssBookKey(bookId)}.json`;

export const dssTranslitChapterAssetPath = (
	bookId: string,
	chapter: number,
): string => `translit/dss/${toDssBookKey(bookId)}/${chapter}.json`;

export const dssTranslitBookAssetPath = (bookId: string): string =>
	`translit/dss/${toDssBookKey(bookId)}.json`;

export const ts2009ChapterAssetPath = (
	bookId: string,
	chapter: number,
): string => `ts2009/${bookId}/${chapter}.json`;

export const appendStaticDataVersion = (
	path: string,
	version?: string | null,
): string => {
	if (!version) return path;
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}v=${encodeURIComponent(version)}`;
};

export const shouldVersionStaticPath = (path: string): boolean => {
	const normalized = path.replace(/^\/+/, "");
	if (normalized.startsWith("api/")) return false;
	if (
		normalized === STATIC_DATA_VERSION_PATH ||
		normalized === "data/version.json" ||
		normalized.endsWith("/version.json") ||
		normalized.endsWith("/manifest.json") ||
		normalized.endsWith("/metadata.json")
	) {
		return false;
	}
	return (
		normalized.startsWith("data/") ||
		normalized.startsWith("dict/") ||
		normalized.startsWith("translit/") ||
		normalized.startsWith("dss/") ||
		normalized.startsWith("oe/") ||
		normalized.startsWith("besorah/") ||
		normalized.startsWith("hutter/") ||
		normalized.startsWith("tth/") ||
		normalized.startsWith("bes/") ||
		normalized.startsWith("ts2009/") ||
		normalized.startsWith("greek/") ||
		normalized.startsWith("prefixes.json")
	);
};
