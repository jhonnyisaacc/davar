const EMPTY_VERSES: never[] = [];

export function hebrewReadingLanguage(
	language: "en" | "es" | "he",
	translationOnly: boolean,
): "en" | "es" | undefined {
	if (translationOnly) return language === "es" ? "es" : "en";
	if (language === "he") return undefined;
	return language;
}

export function readerSourceMode({
	useGreekSource,
	translationOnly,
	besorahTextVersion,
}: {
	useGreekSource: boolean;
	translationOnly: boolean;
	besorahTextVersion: "delitzsch" | "hutter";
}): string {
	if (useGreekSource) return "greek";
	if (translationOnly) return `translation:${besorahTextVersion}`;
	return `source:${besorahTextVersion}`;
}

export function readerChapterIdentity(
	book: string,
	chapter: number,
	sourceMode: string,
): string {
	return `${book.trim().toLowerCase()}:${chapter}:${sourceMode}`;
}

export function visibleChapter<T>({
	publishedIdentity,
	chapterIdentity,
	publishedVerses,
	publishedTranslationPending,
	publishedLoading,
	peekedFull,
	peekedSource,
	translationExpected,
	hasBook,
}: {
	publishedIdentity: string | null;
	chapterIdentity: string;
	publishedVerses: T[];
	publishedTranslationPending: boolean;
	publishedLoading: boolean;
	peekedFull: T[] | null;
	peekedSource: T[] | null;
	translationExpected: boolean;
	hasBook: boolean;
}): {
	verses: T[];
	translationPending: boolean;
	loading: boolean;
} {
	if (publishedIdentity === chapterIdentity) {
		return {
			verses: publishedVerses,
			translationPending: publishedTranslationPending,
			loading: publishedLoading,
		};
	}
	if (peekedFull && peekedFull.length > 0) {
		return {
			verses: peekedFull,
			translationPending: false,
			loading: false,
		};
	}
	if (peekedSource && peekedSource.length > 0) {
		return {
			verses: peekedSource,
			translationPending: translationExpected,
			loading: false,
		};
	}
	return {
		verses: EMPTY_VERSES as T[],
		translationPending: false,
		loading: hasBook,
	};
}
