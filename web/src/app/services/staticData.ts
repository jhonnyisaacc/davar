import { selectDssTransliteration } from "../../../../shared/dssTransliteration";
import {
	canActivateGreekRelease,
	GREEK_RECORDED_REVISION,
	type GreekReleaseManifest,
	greekChapterPath,
	greekLexiconPath,
	greekOccurrencesShardPath,
	greekStrongFamily,
	isGreekBesorahEnabled,
	type ScriptureSourceLanguage,
} from "../../../../shared/greekBesorah";
import {
	cleanGreekSurfaceText,
	cleanLexicalText,
} from "../../../../shared/greekText";
import { joinHebrewPrefixSlashes } from "../../../../shared/hebrewText";
import { instanceSurface } from "../../../../shared/instanceSurface";
import { mapLexiconDefinitions } from "../../../../shared/lexiconAssets";
import {
	besBookAssetPath,
	besorahChapterAssetPath,
	hutterChapterAssetPath,
	oeChapterAssetPath,
	tthBookAssetPath,
} from "../../../../shared/scripturePaths";
import {
	dssBookAssetPath,
	dssChapterAssetPath,
	dssTranslitBookAssetPath,
	dssTranslitChapterAssetPath,
	translitBookAssetPath,
	translitChapterAssetPath,
} from "../../../../shared/staticDataPaths";
import {
	type BesorahTextVersion,
	getMissingSpanishTranslationNotice,
	getPsalmsSuperscriptionNotice,
	resolveTranslationLookupKey,
	resolveTranslationSource,
	resolveTranslationTarget,
	TTH_BOOK_MAPPING,
} from "../../../../shared/translationConfig";
import { getSourceChaptersForTranslationChapter } from "../../../../shared/versification";
import { fetchJson, resetStaticDataFetchCaches } from "./staticDataFetch";
import {
	type DefinitionItem,
	loadLexiconEntryAsset,
	resetLexiconCaches,
	type WordAnalysis,
} from "./staticDataLexicon";
import {
	fetchCachedTs2009Translation,
	resetTs2009Caches,
} from "./staticDataTs2009";

export {
	getPolicyInstances,
	loadLexiconEntry,
	loadLexiconInstances,
	prefetchLexiconEntry,
	searchLexicon,
} from "./staticDataLexicon";
export type { DefinitionItem, WordAnalysis };

export interface WordResponse {
	position: number;
	text: string;
	lemma?: string;
	strong?: string;
	morph?: string;
	prefixes: string[];
	has_dss_variant: boolean;
	translit_en?: string;
	translit_es?: string;
	translit_he?: string;
	lemma_translit_en?: string;
	lemma_translit_es?: string;
	lemma_translit_he?: string;
	source_language?: ScriptureSourceLanguage;
	dss_translit_en?: string;
	dss_translit_es?: string;
}

export interface DssVariant {
	position: number;
	dss_word: string;
	masoretic_word: string;
	dss_translit_en?: string;
	dss_translit_es?: string;
	comment_v2_en?: string;
	comment_v2_es?: string;
	comment_v2_he?: string;
	masoretic_strong?: string;
	dss_strong?: string;
}

export interface TranslationFootnote {
	marker: string;
	number: string;
	word: string;
	explanation: string;
}

export interface VerseResponse {
	chapter: number;
	verse: number;
	sourceChapter: number;
	sourceVerse: number;
	hebrew: string;
	text?: string;
	source_language?: ScriptureSourceLanguage;
	edition?: string;
	revision?: string;
	available?: boolean;
	words: WordResponse[];
	translation?: string;
	translation_language?: string;
	translation_footnotes?: TranslationFootnote[];
	dss?: DssVariant[];
}

type ReferenceMode = "source" | "translation";

export interface BookResponse {
	id: string;
	name: string;
	section: "torah" | "neviim" | "ketuvim" | "besorah";
	chapters: number;
	order: number;
	hebrew_name: string;
	hebrew_transliteration: string;
	spanish_name: string;
}

type MetadataPayload = {
	books: BookResponse[];
	verse_counts?: Record<string, Record<string, number>>;
};

type RawWord = {
	text: string;
	strong?: string;
	morph?: string;
	prefixes?: string[];
	translit_en?: string;
	translit_es?: string;
};

type RawVerse = {
	chapter: number;
	verse: number;
	hebrew: string;
	words?: RawWord[];
};

type RawTranslationFootnote = {
	marker?: string;
	number?: string;
	word?: string;
	explanation?: string;
};

type RawTranslationVerse = {
	verse: number;
	bes?: string;
	tth?: string;
	footnotes?: RawTranslationFootnote[];
};

type RawTranslationBook = {
	book_info?: {
		hebrew_name?: string;
		spanish_name?: string;
	};
	chapters?: Array<{
		chapter: number;
		title?: string;
		verses: RawTranslationVerse[];
	}>;
};

type LoadedTranslationChapter = {
	verses: Record<string, RawTranslationVerse>;
	titles: Record<number, string>;
};

type RawDssDifference = {
	dss_translit_en?: string;
	dss_translit_es?: string;
	position?: number;
	dss_word?: string;
	translit_en?: string;
	translit_es?: string;
	masoretic_word?: string;
	commentary?: string;
	comment_v2_en?: string;
	comment_v2_es?: string;
	comment_v2_he?: string;
	masoretic_strong?: string;
	dss_strong?: string;
};

type RawDssVerse = {
	differences?: RawDssDifference[];
};

type RawDssBook = {
	chapters?: Record<
		string,
		{
			verses?: Record<string, RawDssVerse>;
		}
	>;
};

type RawTranslitWord = {
	text?: string;
	strong?: string;
	translit_en?: string;
	translit_es?: string;
};

type RawTranslitBook = {
	verses?: Array<{
		chapter: number;
		verse: number;
		words?: RawTranslitWord[];
	}>;
};

type RawDssTranslitVariant = {
	chapter?: number;
	verse?: number;
	position?: number;
	translit_en?: string;
	translit_es?: string;
};

type RawDssTranslitBook = {
	variants?: RawDssTranslitVariant[];
};

let metadataPromise: Promise<MetadataPayload> | null = null;
let booksPromise: Promise<BookResponse[]> | null = null;

export const loadMetadata = async (): Promise<MetadataPayload> => {
	if (!metadataPromise) {
		metadataPromise = fetchJson<MetadataPayload>("/data/metadata.json").catch(
			(error) => {
				metadataPromise = null;
				throw error;
			},
		);
	}
	return metadataPromise;
};

const normalizeBookToken = (value: string): string =>
	value.toLowerCase().replace(/[^a-z0-9]/g, "");

const findBook = (
	books: BookResponse[],
	bookName: string,
): BookResponse | undefined => {
	const target = normalizeBookToken(bookName);
	return books.find((book) => {
		const candidates = [
			book.id,
			book.name,
			book.hebrew_name,
			book.hebrew_transliteration,
			book.spanish_name,
		];

		return candidates.some(
			(candidate) => normalizeBookToken(candidate) === target,
		);
	});
};

const TTH_BOOK_KEY_BY_NORMALIZED_TOKEN: Record<string, string> =
	Object.fromEntries(
		Object.keys(TTH_BOOK_MAPPING).map((bookKey) => [
			normalizeBookToken(bookKey),
			bookKey,
		]),
	);

const resolveTthBookId = (bookId: string): string | undefined => {
	const canonicalKey =
		TTH_BOOK_KEY_BY_NORMALIZED_TOKEN[normalizeBookToken(bookId)];

	if (!canonicalKey) {
		return undefined;
	}

	return TTH_BOOK_MAPPING[canonicalKey];
};

const HEBREW_MARKS_RE = /[\u0591-\u05C7]/g;

const normalizeSurfaceWord = (value?: string): string =>
	(value ?? "").replaceAll("/", "").replace(HEBREW_MARKS_RE, "");

const extractBaseStrong = (value?: string): string | undefined => {
	if (!value) return undefined;

	const parts = value
		.toUpperCase()
		.replace(/\s+/g, "")
		.split("/")
		.filter(Boolean);

	for (let index = parts.length - 1; index >= 0; index -= 1) {
		if (/^[HGD]\d+$/.test(parts[index])) {
			return parts[index];
		}
	}

	return parts.length > 0 ? parts[parts.length - 1] : undefined;
};

const getTranslationLookupKey = (
	bookId: string,
	chapter: number,
	verse: number,
	language?: "es" | "en",
): string | null => {
	return resolveTranslationLookupKey(bookId, chapter, verse, { language });
};

const getRequiredTranslationChapters = (
	bookId: string,
	sourceVerses: Array<{ chapter: number; verse: number }>,
	language?: "es" | "en",
): number[] => {
	if (!language) {
		return [];
	}

	const mappedChapters = new Set<number>();

	for (const sourceVerse of sourceVerses) {
		const mappedKey = getTranslationLookupKey(
			bookId,
			sourceVerse.chapter,
			sourceVerse.verse,
			language,
		);
		if (!mappedKey) {
			continue;
		}

		const [mappedChapterToken] = mappedKey.split("-");
		const mappedChapter = Number(mappedChapterToken);
		if (Number.isFinite(mappedChapter) && mappedChapter > 0) {
			mappedChapters.add(mappedChapter);
		}
	}

	if (mappedChapters.size === 0) {
		for (const sourceVerse of sourceVerses) {
			mappedChapters.add(sourceVerse.chapter);
		}
	}

	return [...mappedChapters].sort((a, b) => a - b);
};

const getSourceChaptersForRequest = (
	bookId: string,
	chapter: number,
	language: "es" | "en" | undefined,
	referenceMode: ReferenceMode,
): number[] => {
	if (!Number.isFinite(chapter) || chapter <= 0) {
		return [];
	}

	if (!language || referenceMode !== "translation") {
		return [chapter];
	}

	const source = resolveTranslationSource(bookId, { language });
	if (!source) {
		return [chapter];
	}

	const chapters = getSourceChaptersForTranslationChapter(bookId, chapter);
	return chapters.length > 0 ? chapters : [chapter];
};

const isPsalmsBook = (bookId: string): boolean =>
	normalizeBookToken(bookId) === "psalms";

const HEBREW_RUN_RE = /[\u0590-\u05FF]+/g;

const isolateHebrewRuns = (value: string): string =>
	value.replace(HEBREW_RUN_RE, (token) => `\u2067${token}\u2069`);

const finalizeTranslationDisplayText = (value: string): string =>
	value.trim().length > 0 ? isolateHebrewRuns(value) : value;

const resolveTranslationText = (params: {
	bookId: string;
	language?: "es" | "en";
	mappedTranslationKey: string | null;
	translationTitle?: string | null;
	translationText?: string | null;
}): string => {
	const {
		bookId,
		language,
		mappedTranslationKey,
		translationTitle,
		translationText,
	} = params;

	if (!language) {
		return finalizeTranslationDisplayText(translationText ?? "");
	}

	if (translationTitle && translationTitle.trim().length > 0) {
		return finalizeTranslationDisplayText(translationTitle);
	}

	if (isPsalmsBook(bookId) && mappedTranslationKey === null) {
		return finalizeTranslationDisplayText(
			getPsalmsSuperscriptionNotice(language),
		);
	}

	if (translationText && translationText.trim().length > 0) {
		return finalizeTranslationDisplayText(translationText);
	}

	return finalizeTranslationDisplayText(
		getMissingSpanishTranslationNotice(language),
	);
};

const mapDssDifferences = (differences?: RawDssDifference[]): DssVariant[] => {
	if (!differences?.length) return [];

	return differences.map((difference, index) => {
		const normalizedPosition =
			typeof difference.position === "number"
				? Math.max(0, Math.trunc(difference.position - 1))
				: index;

		return {
			position: normalizedPosition,
			dss_word: difference.dss_word ?? "",
			masoretic_word: difference.masoretic_word ?? "",
			dss_translit_en: difference.dss_translit_en ?? difference.translit_en,
			dss_translit_es: difference.dss_translit_es ?? difference.translit_es,
			comment_v2_en: difference.comment_v2_en ?? difference.commentary,
			comment_v2_es: difference.comment_v2_es,
			comment_v2_he: difference.comment_v2_he,
			masoretic_strong: difference.masoretic_strong,
			dss_strong: difference.dss_strong,
		};
	});
};

const mapTranslationFootnotes = (
	footnotes?: RawTranslationFootnote[],
): TranslationFootnote[] => {
	if (!footnotes?.length) return [];

	return footnotes
		.map((footnote): TranslationFootnote | null => {
			if (!footnote.marker && !footnote.number && !footnote.explanation) {
				return null;
			}

			return {
				marker: footnote.marker ?? "",
				number: footnote.number ?? "",
				word: footnote.word ?? "",
				explanation: footnote.explanation ?? "",
			};
		})
		.filter((footnote): footnote is TranslationFootnote => footnote !== null);
};

const loadCoreChapter = async (
	book: BookResponse,
	chapter: number,
	besorahTextVersion: BesorahTextVersion = "delitzsch",
): Promise<RawVerse[]> => {
	const chapterPath = `/data/${
		book.section === "besorah"
			? besorahTextVersion === "hutter"
				? hutterChapterAssetPath(book.id, chapter)
				: besorahChapterAssetPath(book.id, chapter)
			: oeChapterAssetPath(book.id, chapter)
	}`;

	try {
		return await fetchJson<RawVerse[]>(chapterPath);
	} catch {
		return [];
	}
};

const SHIR_HASHIRIM_ARTIFACT_RE =
	/\s*Final del cántico\.\s*Inicio del cántico\.?/gi;

const sanitizeShirHashirimTth = (text?: string): string | undefined => {
	if (!text) return text;

	const withoutArtifacts = text
		.replace(SHIR_HASHIRIM_ARTIFACT_RE, "")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.trim();

	// Keep emphasis only for single-token spans.
	return withoutArtifacts.replace(/<em>([^<]+)<\/em>/g, (_match, content) => {
		const trimmed = String(content).trim();
		if (!trimmed) return trimmed;
		return trimmed.split(/\s+/).length > 1 ? trimmed : `<em>${trimmed}</em>`;
	});
};

const loadTranslationChapter = async (
	bookId: string,
	requiredChapters: number[],
): Promise<LoadedTranslationChapter> => {
	const translationMap: Record<string, RawTranslationVerse> = {};
	const translationTitles: Record<number, string> = {};
	const hasTranslationText = (verse?: RawTranslationVerse): boolean =>
		Boolean(verse?.tth?.trim() || verse?.bes?.trim());

	// Try TTH_2 first (official Spanish translation)
	const tthBookId = resolveTthBookId(bookId);
	if (tthBookId) {
		try {
			const translationBook = await fetchJson<RawTranslationBook>(
				`/data/${tthBookAssetPath(tthBookId)}`,
			);

			for (const translationChapter of requiredChapters) {
				const chapterData = translationBook.chapters?.find(
					(item) => item.chapter === translationChapter,
				);

				if (!chapterData) {
					continue;
				}

				if (typeof chapterData.title === "string" && chapterData.title.trim()) {
					translationTitles[translationChapter] = chapterData.title.trim();
				}

				const verses =
					tthBookId === "shir_hashirim"
						? chapterData.verses.map((verse) => ({
								...verse,
								tth: sanitizeShirHashirimTth(verse.tth),
							}))
						: chapterData.verses;

				for (const verse of verses) {
					translationMap[`${translationChapter}-${verse.verse}`] = verse;
				}
			}

			const tthCoversRequiredChapters = requiredChapters.every(
				(translationChapter) =>
					translationBook.chapters?.some(
						(item) =>
							item.chapter === translationChapter &&
							(item.verses ?? []).some((verse) => hasTranslationText(verse)),
					),
			);
			if (requiredChapters.length > 0 && tthCoversRequiredChapters) {
				return {
					verses: translationMap,
					titles: translationTitles,
				};
			}
		} catch {
			// TTH_2 not available for this book, try BES fallback below
		}
	}

	// Fill genuinely missing TTH verses from BES.
	try {
		const translationBook = await fetchJson<RawTranslationBook>(
			`/data/${besBookAssetPath(bookId)}`,
		);

		for (const translationChapter of requiredChapters) {
			const chapterData = translationBook.chapters?.find(
				(item) => item.chapter === translationChapter,
			);

			if (!chapterData) {
				continue;
			}

			if (
				!translationTitles[translationChapter] &&
				typeof chapterData.title === "string" &&
				chapterData.title.trim()
			) {
				translationTitles[translationChapter] = chapterData.title.trim();
			}

			for (const verse of chapterData.verses) {
				const key = `${translationChapter}-${verse.verse}`;
				if (!hasTranslationText(translationMap[key])) {
					translationMap[key] = verse;
				}
			}
		}

		return {
			verses: translationMap,
			titles: translationTitles,
		};
	} catch {
		return {
			verses: translationMap,
			titles: translationTitles,
		};
	}
};

const indexDssChapterVerses = (
	chapter: number,
	verses?: Record<string, RawDssVerse>,
): Record<string, RawDssVerse> => {
	if (!verses) return {};

	return Object.entries(verses).reduce(
		(acc, [verseKey, verseValue]) => {
			acc[`${chapter}:${Number.parseInt(verseKey, 10)}`] = verseValue;
			return acc;
		},
		{} as Record<string, RawDssVerse>,
	);
};

const loadDssChapter = async (
	bookId: string,
	chapter: number,
): Promise<Record<string, RawDssVerse>> => {
	try {
		const chapterData = await fetchJson<{
			verses?: Record<string, RawDssVerse>;
		}>(`/data/${dssChapterAssetPath(bookId, chapter)}`);
		return indexDssChapterVerses(chapter, chapterData.verses);
	} catch {
		try {
			const dssBook = await fetchJson<RawDssBook>(
				`/data/${dssBookAssetPath(bookId)}`,
			);
			return indexDssChapterVerses(
				chapter,
				dssBook.chapters?.[String(chapter)]?.verses,
			);
		} catch {
			return {};
		}
	}
};

const indexTranslitVerses = (
	chapter: number,
	verses?: RawTranslitBook["verses"],
): Record<string, RawTranslitWord[]> => {
	const verseMap: Record<string, RawTranslitWord[]> = {};
	for (const verseEntry of verses ?? []) {
		if (verseEntry.chapter !== chapter) continue;
		verseMap[`${chapter}:${verseEntry.verse}`] = verseEntry.words ?? [];
	}
	return verseMap;
};

const loadTranslitChapter = async (
	bookId: string,
	chapter: number,
): Promise<Record<string, RawTranslitWord[]>> => {
	try {
		const translitChapter = await fetchJson<RawTranslitBook>(
			`/data/${translitChapterAssetPath(bookId, chapter)}`,
		);
		return indexTranslitVerses(chapter, translitChapter.verses);
	} catch {
		try {
			const translitBook = await fetchJson<RawTranslitBook>(
				`/data/${translitBookAssetPath(bookId)}`,
			);
			return indexTranslitVerses(chapter, translitBook.verses);
		} catch {
			return {};
		}
	}
};

const indexDssTranslitVariants = (
	chapter: number,
	variants?: RawDssTranslitVariant[],
): Record<string, Record<number, RawDssTranslitVariant>> => {
	const verseMap: Record<string, Record<number, RawDssTranslitVariant>> = {};

	for (const variant of variants ?? []) {
		if (variant.chapter !== chapter) continue;

		const verse = Number(variant.verse);
		const position = Number(variant.position);
		if (
			!Number.isFinite(verse) ||
			!Number.isFinite(position) ||
			position <= 0
		) {
			continue;
		}

		const key = `${chapter}:${verse}`;
		if (!verseMap[key]) {
			verseMap[key] = {};
		}

		// Align with WordResponse.position which is zero-based on web.
		verseMap[key][position - 1] = variant;
	}

	return verseMap;
};

const loadDssTranslitChapter = async (
	bookId: string,
	chapter: number,
): Promise<Record<string, Record<number, RawDssTranslitVariant>>> => {
	try {
		const translitChapter = await fetchJson<RawDssTranslitBook>(
			`/data/${dssTranslitChapterAssetPath(bookId, chapter)}`,
		);
		return indexDssTranslitVariants(chapter, translitChapter.variants);
	} catch {
		try {
			const translitBook = await fetchJson<RawDssTranslitBook>(
				`/data/${dssTranslitBookAssetPath(bookId)}`,
			);
			return indexDssTranslitVariants(chapter, translitBook.variants);
		} catch {
			return {};
		}
	}
};

const findFallbackTranslitWord = (
	word: RawWord,
	translitWords: RawTranslitWord[],
): RawTranslitWord | undefined => {
	const baseStrong = extractBaseStrong(word.strong);
	const normalizedText = normalizeSurfaceWord(word.text);

	if (!baseStrong && !normalizedText) {
		return undefined;
	}

	return translitWords.find((candidate) => {
		const candidateStrong = extractBaseStrong(candidate.strong);
		const candidateText = normalizeSurfaceWord(candidate.text);

		const strongMatches =
			baseStrong && candidateStrong ? baseStrong === candidateStrong : false;
		const textMatches =
			normalizedText && candidateText
				? normalizedText === candidateText
				: false;

		if (baseStrong && !strongMatches) return false;
		if (normalizedText && !textMatches) return false;

		return strongMatches || textMatches;
	});
};

const mapVerse = (
	bookId: string,
	rawVerse: RawVerse,
	outputChapter: number,
	outputVerse: number,
	translationVerse?: RawTranslationVerse,
	translationTitle?: string | null,
	dssVerse?: RawDssVerse,
	translitWords?: RawTranslitWord[],
	dssTranslitByPosition?: Record<number, RawDssTranslitVariant>,
	options?: {
		language?: "es" | "en";
		showDss?: boolean;
		hebrewOnly?: boolean;
	},
	ts2009Translation?: string | null,
	mappedTranslationKey?: string | null,
): VerseResponse => {
	const dssVariants = mapDssDifferences(dssVerse?.differences);
	const dssVariantMap = new Map(
		dssVariants.map((variant) => [variant.position, variant]),
	);
	const sourceWords = rawVerse.words ?? [];
	const canMapTranslitByPosition = translitWords
		? translitWords.length === sourceWords.length
		: false;

	const words: WordResponse[] = sourceWords.map((word, index) => {
		const dssVariant = dssVariantMap.get(index);
		const dssTranslit = dssTranslitByPosition?.[index];
		const prefersDssTranslit = Boolean(options?.showDss && dssVariant);
		const dssTranslitEn = selectDssTransliteration(
			dssVariant?.dss_translit_en,
			dssTranslit?.translit_en,
		);
		const dssTranslitEs = selectDssTransliteration(
			dssVariant?.dss_translit_es,
			dssTranslit?.translit_es,
		);
		const translitWord = canMapTranslitByPosition
			? translitWords?.[index]
			: translitWords
				? findFallbackTranslitWord(word, translitWords)
				: undefined;

		return {
			position: index,
			text: word.text,
			strong: word.strong,
			morph: word.morph,
			prefixes: word.prefixes ?? [],
			has_dss_variant: dssVariantMap.has(index),
			translit_en: prefersDssTranslit
				? dssTranslitEn
				: (word.translit_en ?? translitWord?.translit_en),
			translit_es: prefersDssTranslit
				? dssTranslitEs
				: (word.translit_es ?? translitWord?.translit_es),
			dss_translit_en: dssTranslitEn,
			dss_translit_es: dssTranslitEs,
		};
	});

	const response: VerseResponse = {
		chapter: outputChapter,
		verse: outputVerse,
		sourceChapter: rawVerse.chapter,
		sourceVerse: rawVerse.verse,
		hebrew: rawVerse.hebrew,
		words,
	};

	// Handle translation based on language
	if (!options?.hebrewOnly) {
		const language = options?.language;
		const baseTranslationText =
			language === "en"
				? ts2009Translation
				: (translationVerse?.bes ?? translationVerse?.tth);
		const translationText = resolveTranslationText({
			bookId,
			language,
			mappedTranslationKey: mappedTranslationKey ?? null,
			translationTitle,
			translationText: baseTranslationText,
		});

		if (options?.language === "en") {
			response.translation = translationText;
			response.translation_language = "en";
		} else if (options?.language === "es") {
			response.translation = translationText;
			response.translation_language = "es";
			if (translationVerse?.bes || translationVerse?.tth) {
				const translationFootnotes = mapTranslationFootnotes(
					translationVerse.footnotes,
				);
				if (translationFootnotes.length > 0) {
					response.translation_footnotes = translationFootnotes;
				}
			}
		}
	}

	if (options?.showDss && dssVariants.length > 0) {
		response.dss = dssVariants;
	}

	return response;
};

export const getBooks = async (): Promise<BookResponse[]> => {
	if (!booksPromise) {
		booksPromise = (async () => {
			const metadata = await loadMetadata();
			const books = metadata.books;

			const hasPlaceholderLabels = books.some(
				(book) =>
					book.hebrew_name === book.name && book.spanish_name === book.name,
			);

			if (!hasPlaceholderLabels) {
				return books;
			}

			const hydrated = await Promise.all(
				books.map(async (book) => {
					try {
						const translationBook = await fetchJson<RawTranslationBook>(
							`/data/${besBookAssetPath(book.id)}`,
						);
						const bookInfo = translationBook.book_info;

						return {
							...book,
							hebrew_name: bookInfo?.hebrew_name || book.hebrew_name,
							spanish_name: bookInfo?.spanish_name || book.spanish_name,
						};
					} catch {
						return book;
					}
				}),
			);

			return hydrated;
		})().catch((error) => {
			booksPromise = null;
			throw error;
		});
	}

	return booksPromise;
};

export const lookupBook = async (bookName: string): Promise<BookResponse> => {
	const metadata = await loadMetadata();
	const match = findBook(metadata.books, bookName);

	if (!match) {
		throw new Error(`Book not found: ${bookName}`);
	}

	return match;
};

export const getChapterCount = async (book: string): Promise<number> => {
	const metadata = await loadMetadata();
	const bookEntry = findBook(metadata.books, book);

	if (!bookEntry) return 1;
	return bookEntry.chapters;
};

export const getVerseCount = async (
	book: string,
	chapter: number,
): Promise<number> => {
	const metadata = await loadMetadata();
	const bookEntry = findBook(metadata.books, book);

	if (!bookEntry) return 1;

	const verseCounts = metadata.verse_counts?.[bookEntry.name];
	if (verseCounts?.[String(chapter)]) {
		return verseCounts[String(chapter)];
	}

	const chapterVerses = await getChapterVerses(bookEntry.id, chapter, {
		hebrewOnly: true,
	});
	return chapterVerses.length;
};

type ChapterVerseOptions = {
	language?: "es" | "en";
	showDss?: boolean;
	hebrewOnly?: boolean;
	referenceMode?: ReferenceMode;
	besorahTextVersion?: BesorahTextVersion;
};

const chapterVerseResults = new Map<string, VerseResponse[]>();
const greekChapterResults = new Map<string, VerseResponse[]>();

export function chapterVerseCacheKey(
	book: string,
	chapter: number,
	options?: ChapterVerseOptions,
): string {
	return [
		book.trim().toLowerCase(),
		String(chapter),
		options?.language ?? "",
		options?.hebrewOnly ? "h" : "",
		options?.showDss ? "d" : "",
		options?.referenceMode ?? "source",
		options?.besorahTextVersion ?? "delitzsch",
	].join("|");
}

function rememberChapterVerses(
	book: string,
	bookEntry: { id: string; name: string },
	chapter: number,
	options: ChapterVerseOptions | undefined,
	verses: VerseResponse[],
): void {
	if (verses.length === 0) return;
	const aliases = new Set(
		[book, bookEntry.id, bookEntry.name].map((alias) =>
			alias.trim().toLowerCase(),
		),
	);
	for (const alias of aliases) {
		chapterVerseResults.set(
			chapterVerseCacheKey(alias, chapter, options),
			verses,
		);
	}
}

export function peekChapterVerses(
	book: string,
	chapter: number,
	options?: ChapterVerseOptions,
): VerseResponse[] | null {
	return (
		chapterVerseResults.get(chapterVerseCacheKey(book, chapter, options)) ??
		null
	);
}

export function readyHebrewChapter(
	book: string,
	chapter: number,
	options: {
		language?: "es" | "en";
		showDss?: boolean;
		referenceMode?: ReferenceMode;
		besorahTextVersion?: BesorahTextVersion;
		sourceFirst: boolean;
	},
): { full: VerseResponse[] | null; source: VerseResponse[] | null } {
	const shared = {
		language: options.language,
		referenceMode: options.referenceMode,
		besorahTextVersion: options.besorahTextVersion,
	};
	const withDss = peekChapterVerses(book, chapter, {
		...shared,
		hebrewOnly: false,
		showDss: options.showDss,
	});
	const withoutDss = options.showDss
		? peekChapterVerses(book, chapter, {
				...shared,
				hebrewOnly: false,
				showDss: false,
			})
		: null;
	const full = withDss ?? withoutDss;
	const source =
		options.sourceFirst && !full
			? peekChapterVerses(book, chapter, {
					...shared,
					language: undefined,
					hebrewOnly: true,
					showDss: false,
				})
			: null;
	return { full, source };
}

function greekChapterCacheKey(
	book: string,
	chapter: number,
	options?: {
		language?: "en" | "es" | "he";
		includeTranslation?: boolean;
		revision?: string;
	},
): string {
	return [
		book.trim().toLowerCase(),
		String(chapter),
		options?.language ?? "",
		options?.includeTranslation === false ? "source" : "translated",
		options?.revision ?? GREEK_RECORDED_REVISION,
	].join("|");
}

export function peekGreekChapterVerses(
	book: string,
	chapter: number,
	options?: {
		language?: "en" | "es" | "he";
		includeTranslation?: boolean;
		revision?: string;
	},
): VerseResponse[] | null {
	return (
		greekChapterResults.get(greekChapterCacheKey(book, chapter, options)) ??
		null
	);
}

export const getChapterVerses = async (
	book: string,
	chapter: number,
	options?: ChapterVerseOptions,
): Promise<VerseResponse[]> => {
	const metadata = await loadMetadata();
	const bookEntry = findBook(metadata.books, book);

	if (!bookEntry) return [];
	const referenceMode = options?.referenceMode ?? "source";
	const besorahTextVersion = options?.besorahTextVersion ?? "delitzsch";
	const sourceChapters = getSourceChaptersForRequest(
		bookEntry.id,
		chapter,
		options?.language,
		referenceMode,
	);
	const needsEnglishTranslation =
		!options?.hebrewOnly && options?.language === "en";
	const needsSpanishTranslation =
		!options?.hebrewOnly && options?.language === "es";
	const emptyTranslations: LoadedTranslationChapter = {
		verses: {},
		titles: {},
	};

	const corePromise = Promise.all(
		sourceChapters.map((sourceChapter) =>
			loadCoreChapter(bookEntry, sourceChapter, besorahTextVersion),
		),
	);
	const transliterationPromise = Promise.all(
		sourceChapters.map((sourceChapter) =>
			loadTranslitChapter(bookEntry.id, sourceChapter),
		),
	).then((records) => Object.assign({}, ...records));
	const dssPromise = options?.showDss
		? Promise.all(
				sourceChapters.map((sourceChapter) =>
					loadDssChapter(bookEntry.id, sourceChapter),
				),
			).then((records) => Object.assign({}, ...records))
		: Promise.resolve<Record<string, RawDssVerse>>({});
	const dssTransliterationPromise = options?.showDss
		? Promise.all(
				sourceChapters.map((sourceChapter) =>
					loadDssTranslitChapter(bookEntry.id, sourceChapter),
				),
			).then(
				(records) =>
					Object.assign({}, ...records) as Record<
						string,
						Record<number, RawDssTranslitVariant>
					>,
			)
		: Promise.resolve<Record<string, Record<number, RawDssTranslitVariant>>>(
				{},
			);

	if (needsEnglishTranslation) {
		const guessedChapters =
			referenceMode === "translation" ? [chapter] : sourceChapters;
		for (const guessedChapter of guessedChapters) {
			void fetchCachedTs2009Translation(bookEntry.id, guessedChapter, 1).catch(
				() => null,
			);
		}
	}

	if (needsSpanishTranslation) {
		const tthBookId = resolveTthBookId(bookEntry.id);
		if (tthBookId) {
			void fetchJson(`/data/${tthBookAssetPath(tthBookId)}`).catch(
				() => undefined,
			);
		}
	}

	const translationPromise = needsSpanishTranslation
		? corePromise.then(async (coreVerseChunks) => {
				const loadedCoreVerses = coreVerseChunks.flat();
				if (loadedCoreVerses.length === 0) {
					return emptyTranslations;
				}
				return loadTranslationChapter(
					bookEntry.id,
					getRequiredTranslationChapters(
						bookEntry.id,
						loadedCoreVerses.map((verse) => ({
							chapter: verse.chapter,
							verse: verse.verse,
						})),
						"es",
					),
				);
			})
		: Promise.resolve(emptyTranslations);

	const ts2009Promise = needsEnglishTranslation
		? corePromise.then(async (coreVerseChunks) => {
				const loadedCoreVerses = coreVerseChunks.flat();
				const uniqueTranslationKeys = [
					...new Set(
						loadedCoreVerses
							.map((verse) =>
								getTranslationLookupKey(
									bookEntry.id,
									verse.chapter,
									verse.verse,
									"en",
								),
							)
							.filter((key): key is string => Boolean(key)),
					),
				];
				const ts2009Results = await Promise.all(
					uniqueTranslationKeys.map(async (translationKey) => {
						const [mappedChapterToken, mappedVerseToken] =
							translationKey.split("-");
						const mappedChapter = Number(mappedChapterToken);
						const mappedVerse = Number(mappedVerseToken);

						if (
							!Number.isFinite(mappedChapter) ||
							!Number.isFinite(mappedVerse)
						) {
							return [translationKey, null] as const;
						}

						const translation = await fetchCachedTs2009Translation(
							bookEntry.id,
							mappedChapter,
							mappedVerse,
						);

						return [translationKey, translation] as const;
					}),
				);

				return Object.fromEntries(
					ts2009Results.flatMap(([translationKey, translation]) =>
						translation === null ? [] : [[translationKey, translation]],
					),
				) as Record<string, string>;
			})
		: Promise.resolve<Record<string, string>>({});

	const [
		coreVerseChunks,
		translations,
		dssVerses,
		transliterations,
		dssTransliterations,
		ts2009Translations,
	] = await Promise.all([
		corePromise,
		translationPromise,
		dssPromise,
		transliterationPromise,
		dssTransliterationPromise,
		ts2009Promise,
	]);
	const coreVerses = coreVerseChunks.flat();

	if (coreVerses.length === 0) {
		return [];
	}

	const mappedVerses = coreVerses.map((rawVerse) => {
		const translationTarget = resolveTranslationTarget(
			bookEntry.id,
			rawVerse.chapter,
			rawVerse.verse,
			{ language: options?.language },
		);
		const translationKey = translationTarget.reference
			? `${translationTarget.reference.chapter}-${translationTarget.reference.verse}`
			: null;
		const outputChapter =
			referenceMode === "translation"
				? (translationTarget.reference?.chapter ?? 0)
				: rawVerse.chapter;
		const outputVerse =
			referenceMode === "translation"
				? (translationTarget.reference?.verse ?? 0)
				: rawVerse.verse;
		const verseKey = `${rawVerse.chapter}:${rawVerse.verse}`;

		return mapVerse(
			bookEntry.id,
			rawVerse,
			outputChapter,
			outputVerse,
			translationKey ? translations.verses[translationKey] : undefined,
			translationTarget.usesPsalmTitle
				? (translations.titles[rawVerse.chapter] ?? null)
				: null,
			dssVerses[verseKey],
			transliterations[verseKey],
			dssTransliterations[verseKey],
			options,
			translationKey ? ts2009Translations[translationKey] : undefined,
			translationKey,
		);
	});

	const ordered =
		referenceMode === "translation" && options?.language
			? mappedVerses
					.filter((verse) => verse.chapter === chapter)
					.sort(
						(a, b) =>
							a.verse - b.verse ||
							a.sourceChapter - b.sourceChapter ||
							a.sourceVerse - b.sourceVerse,
					)
			: mappedVerses.sort(
					(a, b) =>
						a.sourceChapter - b.sourceChapter || a.sourceVerse - b.sourceVerse,
				);
	rememberChapterVerses(book, bookEntry, chapter, options, ordered);
	return ordered;
};

export const getVerse = async (
	book: string,
	chapter: number,
	verse: number,
	options?: {
		language?: "es" | "en";
		showDss?: boolean;
		hebrewOnly?: boolean;
	},
): Promise<VerseResponse | null> => {
	const verses = await getChapterVerses(book, chapter, options);
	return verses.find((item) => item.verse === verse) ?? null;
};

type GreekChapterPayload = {
	book: string;
	chapter: number;
	complete: boolean;
	edition: "sblgnt";
	revision: string;
	source_language: "greek";
	verses: Array<{
		chapter: number;
		verse: number | null;
		verse_id: string;
		source_ref: string;
		text: string;
		words: WordResponse[];
	}>;
};

type GreekDefinition = {
	short?: string | null;
	fuller?: string | null;
	source?: string;
	review_status?: "approved" | "imported" | "draft";
	license?: string;
};

type GreekLexiconEntry = {
	strong: string;
	lemma: string;
	translit_en?: string;
	translit_es?: string;
	translit_he?: string;
	definitions?: Partial<Record<"en" | "es" | "he", GreekDefinition>>;
	occurrences_count?: number;
	instances?: Array<{
		book: string;
		chapter: number;
		verse?: number | null;
		verse_id?: string;
		index: number;
		text?: string;
	}>;
};

const greekManifestPromises = new Map<string, Promise<GreekReleaseManifest>>();
const greekLexiconPromises = new Map<
	string,
	Promise<Record<string, GreekLexiconEntry>>
>();
const greekOccurrenceShardPromises = new Map<
	string,
	Promise<Record<string, GreekOccurrenceBucket>>
>();

type GreekOccurrenceBucket = {
	count?: number;
	namespace?: "G";
	references?: NonNullable<GreekLexiconEntry["instances"]>;
};

export const isGreekPreviewEnabled = (): boolean => {
	try {
		return isGreekBesorahEnabled({
			PUBLIC_GREEK_PREVIEW_ENABLED: import.meta.env
				.PUBLIC_GREEK_PREVIEW_ENABLED,
			PUBLIC_GREEK_PUBLIC_ENABLED: import.meta.env.PUBLIC_GREEK_PUBLIC_ENABLED,
		});
	} catch {
		// bun dev serves modules without the production `define` inlines.
		return true;
	}
};

export const loadGreekReleaseManifest = async (
	revision = GREEK_RECORDED_REVISION,
): Promise<GreekReleaseManifest> => {
	let promise = greekManifestPromises.get(revision);
	if (!promise) {
		promise = fetchJson<GreekReleaseManifest>("/data/greek/manifest.json").then(
			(manifest) => {
				if (manifest.revision !== revision) {
					throw new Error(
						`Greek release mismatch: requested ${revision}, active ${manifest.revision}`,
					);
				}
				if (!canActivateGreekRelease(manifest)) {
					throw new Error(`Greek release ${revision} is incomplete`);
				}
				return manifest;
			},
		);
		greekManifestPromises.set(revision, promise);
	}
	return promise;
};

export const getGreekChapterVerses = async (
	book: string,
	chapter: number,
	options?: {
		language?: "en" | "es" | "he";
		includeTranslation?: boolean;
		revision?: string;
	},
): Promise<VerseResponse[]> => {
	if (!isGreekPreviewEnabled()) return [];
	const revision = options?.revision ?? GREEK_RECORDED_REVISION;
	await loadGreekReleaseManifest(revision);
	const payload = await fetchJson<GreekChapterPayload>(
		`/data/${greekChapterPath(book.toLowerCase(), chapter, revision)}`,
	);
	if (
		!payload.complete ||
		payload.revision !== revision ||
		payload.source_language !== "greek"
	) {
		throw new Error(`Invalid Greek chapter bundle: ${book} ${chapter}`);
	}
	const translations =
		options?.includeTranslation === false
			? []
			: options?.language === "he"
				? (
						await getChapterVerses(book, chapter, {
							besorahTextVersion: "delitzsch",
						})
					).map((verse) => ({
						...verse,
						translation: joinHebrewPrefixSlashes(verse.hebrew),
						translation_language: "he" as const,
					}))
				: await getChapterVerses(book, chapter, {
						language: options?.language,
					});
	const translationByVerse = new Map(
		translations.map((verse) => [verse.verse, verse]),
	);
	const sourceByVerse = new Map(
		payload.verses
			.filter((verse) => Number.isInteger(verse.verse))
			.map((verse) => [verse.verse as number, verse]),
	);
	const verseNumbers = [
		...new Set([...sourceByVerse.keys(), ...translationByVerse.keys()]),
	].sort((left, right) => left - right);
	const greekVerses = verseNumbers.map((verseNumber) => {
		const verse = sourceByVerse.get(verseNumber);
		const translated = translationByVerse.get(verseNumber);
		return {
			available: Boolean(verse),
			chapter,
			edition: payload.edition,
			hebrew: "",
			revision,
			sourceChapter: chapter,
			sourceVerse: verseNumber,
			source_language: "greek" as const,
			text: cleanGreekSurfaceText(verse?.text ?? ""),
			translation: translated?.translation,
			translation_footnotes: translated?.translation_footnotes,
			translation_language: translated?.translation_language,
			verse: verseNumber,
			words: (verse?.words ?? []).map((word) => ({
				...word,
				has_dss_variant: false,
				prefixes: [],
				source_language: "greek" as const,
				text: cleanGreekSurfaceText(word.text),
			})),
		};
	});
	if (greekVerses.length > 0) {
		greekChapterResults.set(
			greekChapterCacheKey(book, chapter, options),
			greekVerses,
		);
	}
	return greekVerses;
};

export const getGreekVerse = async (
	book: string,
	chapter: number,
	verse: number,
	options?: {
		language?: "en" | "es" | "he";
		revision?: string;
	},
): Promise<VerseResponse> => {
	const verses = await getGreekChapterVerses(book, chapter, options);
	return (
		verses.find((item) => item.verse === verse) ?? {
			available: false,
			chapter,
			edition: "sblgnt",
			hebrew: "",
			revision: options?.revision ?? GREEK_RECORDED_REVISION,
			sourceChapter: chapter,
			sourceVerse: verse,
			source_language: "greek",
			text: "",
			verse,
			words: [],
		}
	);
};

export const loadGreekLexiconEntry = async (
	strong?: string,
	language: "en" | "es" | "he" = "en",
	revision = GREEK_RECORDED_REVISION,
): Promise<WordAnalysis | null> => {
	if (!isGreekPreviewEnabled() || !strong?.startsWith("G")) return null;
	await loadGreekReleaseManifest(revision);
	let promise = greekLexiconPromises.get(revision);
	if (!promise) {
		promise = fetchJson<Record<string, GreekLexiconEntry>>(
			`/data/${greekLexiconPath(revision)}`,
		);
		greekLexiconPromises.set(revision, promise);
	}
	const family = greekStrongFamily(strong);
	const [lexicon, customAsset] = await Promise.all([
		promise,
		loadLexiconEntryAsset(family).then(
			(asset) =>
				asset ?? (family === strong ? null : loadLexiconEntryAsset(strong)),
		),
	]);
	const entry =
		lexicon[strong] ??
		lexicon[family] ??
		Object.values(lexicon).find(
			(item) => greekStrongFamily(item.strong) === family,
		);
	if (!entry) return null;
	const localized = entry.definitions?.[language];
	const english = entry.definitions?.en;
	const usable = (definition?: GreekDefinition) =>
		Boolean(definition?.short || definition?.fuller);
	const selected = localized && usable(localized) ? localized : english;
	const definitions: DefinitionItem[] = mapLexiconDefinitions(
		customAsset?.definitions,
		language,
	);
	if (selected?.short) {
		definitions.push({
			language: selected === localized ? language : "en",
			license: selected.license,
			review_status: selected.review_status,
			source: selected.source ?? "stepbible-tbesg",
			text: cleanLexicalText(selected.short),
		});
	}
	if (selected?.fuller && selected.fuller !== selected.short) {
		definitions.push({
			language: selected === localized ? language : "en",
			license: selected.license,
			review_status: selected.review_status,
			source: selected.source ?? "stepbible-tbesg",
			text: cleanLexicalText(selected.fuller),
		});
	}
	const inlineInstances = entry.instances ?? [];
	const surface = instanceSurface({
		instance_total: entry.occurrences_count,
		instances: inlineInstances.map((instance) => ({
			...instance,
			verse: instance.verse ?? undefined,
		})),
	});
	return {
		definitions,
		edition: "sblgnt",
		full_definition: selected?.fuller
			? cleanLexicalText(selected.fuller)
			: undefined,
		greek: entry.lemma,
		has_instances_asset: inlineInstances.length === 0,
		instances: surface.instances,
		lemma: entry.lemma,
		lemma_translit_en: entry.translit_en,
		lemma_translit_es: entry.translit_es,
		lemma_translit_he: entry.translit_he,
		occurrences_count: surface.total,
		revision,
		short_meaning: selected?.short
			? cleanLexicalText(selected.short)
			: undefined,
		source_language: "greek",
		strong_number: entry.strong,
		translit_en: entry.translit_en,
		translit_es: entry.translit_es,
		translit_he: entry.translit_he,
	};
};

export const loadGreekLexiconInstances = async (
	strong?: string,
	revision = GREEK_RECORDED_REVISION,
): Promise<Partial<WordAnalysis> | null> => {
	if (!strong) return null;
	const family = greekStrongFamily(strong);
	const occurrences =
		(await loadGreekOccurrenceBucket(strong, revision)) ??
		(await loadGreekOccurrenceBucket(family, revision));
	if (!occurrences) return null;
	const surface = instanceSurface({
		instance_total: occurrences.count,
		instances: (occurrences.references ?? []).map((instance) => ({
			...instance,
			verse: instance.verse ?? undefined,
		})),
	});
	return {
		has_instances_asset: false,
		instances: surface.instances,
		occurrences_count: surface.total,
	};
};

const loadGreekOccurrenceBucket = async (
	strong: string,
	revision = GREEK_RECORDED_REVISION,
): Promise<GreekOccurrenceBucket | undefined> => {
	const path = greekOccurrencesShardPath(strong, revision);
	let promise = greekOccurrenceShardPromises.get(path);
	if (!promise) {
		promise = fetchJson<Record<string, GreekOccurrenceBucket>>(
			`/data/${path}`,
		).catch(() => ({}));
		greekOccurrenceShardPromises.set(path, promise);
	}
	return (await promise)[strong];
};

export const prefetchChapterResources = (
	book: string,
	chapter: number,
	options?: Parameters<typeof getChapterVerses>[2],
): void => {
	if (!Number.isFinite(chapter) || chapter <= 0) return;
	void getChapterVerses(book, chapter, {
		...options,
		showDss: false,
	}).catch(() => undefined);
};

export const prefetchGreekChapter = (
	book: string,
	chapter: number,
	options?: Parameters<typeof getGreekChapterVerses>[2],
): void => {
	if (!Number.isFinite(chapter) || chapter <= 0) return;
	void getGreekChapterVerses(book, chapter, options).catch(() => undefined);
};

// ── Prefix Service ───────────────────────────────────────────────────────

let prefixesPromise: Promise<Record<string, unknown>> | null = null;

const loadPrefixes = async (): Promise<Record<string, unknown>> => {
	if (!prefixesPromise) {
		prefixesPromise = fetchJson<Record<string, unknown>>("/data/prefixes.json");
	}
	return prefixesPromise;
};

export const loadPrefix = async (prefixId: string): Promise<unknown> => {
	const prefixes = await loadPrefixes();
	return prefixes[prefixId] ?? null;
};

export const resetStaticDataCachesForTests = (): void => {
	resetStaticDataFetchCaches();
	resetTs2009Caches();
	metadataPromise = null;
	booksPromise = null;
	resetLexiconCaches();
	prefixesPromise = null;
	greekManifestPromises.clear();
	greekLexiconPromises.clear();
	greekOccurrenceShardPromises.clear();
	chapterVerseResults.clear();
	greekChapterResults.clear();
};
