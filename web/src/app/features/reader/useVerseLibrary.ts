import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { GREEK_BESORAH_BOOK_NAMES } from "@davar/shared/greekBesorah";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { translate } from "../../hooks/useTranslation";
import {
	type BookResponse,
	getBooks,
	getChapterCount,
	getChapterVerses,
	getGreekChapterVerses,
	getVerseCount,
	peekChapterVerses,
	peekGreekChapterVerses,
	prefetchChapterResources,
	prefetchGreekChapter,
	readyHebrewChapter,
	type VerseResponse,
} from "../../services/staticData";
import { formatBookDisplayName } from "../../utils/bookNameFormatter";
import type { RouteScreen } from "../../utils/routeState";
import { resolveGreekOverlayLanguage } from "../../utils/translationConfig";
import {
	hebrewReadingLanguage,
	readerChapterIdentity,
	readerSourceMode,
	visibleChapter,
} from "./visibleChapter";

export function useVerseLibrary({
	currentBook,
	currentChapter,
	currentVerse,
	currentScreen,
	setCurrentBook,
	setCurrentChapter,
	setCurrentVerse,
	setCurrentScreen,
	language,
	besorahLanguage,
	besorahTextVersion,
	showQumran,
	translationOnly,
	greekAvailable,
	t,
}: {
	currentBook: string;
	currentChapter: number;
	currentVerse: number;
	currentScreen: RouteScreen;
	setCurrentBook: (book: string) => void;
	setCurrentChapter: (chapter: number) => void;
	setCurrentVerse: Dispatch<SetStateAction<number>>;
	setCurrentScreen: (screen: RouteScreen) => void;
	language: "en" | "es" | "he";
	besorahLanguage: BesorahLanguage;
	besorahTextVersion: "delitzsch" | "hutter";
	showQumran: boolean;
	translationOnly: boolean;
	greekAvailable: boolean;
	t: (key: string) => string;
}) {
	const [books, setBooks] = useState<BookResponse[]>([]);
	const [chapterVerses, setChapterVerses] = useState<VerseResponse[]>([]);
	const [publishedIdentity, setPublishedIdentity] = useState<string | null>(
		null,
	);
	const [chapterCount, setChapterCount] = useState(1);
	const [verseCount, setVerseCount] = useState(1);
	const [isLoading, setIsLoading] = useState(false);
	const [translationPending, setTranslationPending] = useState(false);
	const [_errorMessage, setErrorMessage] = useState<string | null>(null);
	const chapterLoadRequestRef = useRef(0);

	const bookOptions = useMemo(
		() =>
			[...books]
				.sort((a, b) => a.order - b.order)
				.map((book) => ({
					name: book.name,
					hebrew: book.hebrew_name,
					spanish: book.spanish_name,
					greek: GREEK_BESORAH_BOOK_NAMES[book.id],
					section: book.section,
				})),
		[books],
	);
	const currentBookMeta = useMemo(
		() =>
			books.find(
				(item) => item.name.toLowerCase() === currentBook.toLowerCase(),
			) ?? null,
		[books, currentBook],
	);
	const isBesorah = currentBookMeta?.section === "besorah";
	const useGreekSource =
		greekAvailable &&
		isBesorah &&
		besorahLanguage === "greek" &&
		!translationOnly;
	const chapterIdentity = readerChapterIdentity(
		currentBook,
		currentChapter,
		readerSourceMode({
			useGreekSource,
			translationOnly,
			besorahTextVersion,
		}),
	);
	const hebrewTranslationLanguage = hebrewReadingLanguage(
		language,
		translationOnly,
	);
	const paintSourceFirst = !useGreekSource && !translationOnly;
	const referenceMode = translationOnly ? "translation" : "source";
	const chapterPreview = useGreekSource
		? {
				full: peekGreekChapterVerses(currentBook, currentChapter, {
					language: resolveGreekOverlayLanguage(language, translationOnly),
				}),
				source: null,
			}
		: readyHebrewChapter(currentBook, currentChapter, {
				language: hebrewTranslationLanguage,
				showDss: showQumran,
				referenceMode,
				besorahTextVersion,
				sourceFirst: paintSourceFirst,
			});
	const readerChapter = visibleChapter({
		publishedIdentity,
		chapterIdentity,
		publishedVerses: chapterVerses,
		publishedTranslationPending: translationPending,
		publishedLoading: isLoading,
		peekedFull: chapterPreview.full,
		peekedSource: chapterPreview.source,
		translationExpected: paintSourceFirst && Boolean(hebrewTranslationLanguage),
		hasBook: Boolean(currentBook),
	});
	const readerVerses = readerChapter.verses;
	const readerLoading = readerChapter.loading;
	const readerTranslationPending = readerChapter.translationPending;
	const currentVerseData = useMemo(
		() => readerVerses.find((item) => item.verse === currentVerse) ?? null,
		[readerVerses, currentVerse],
	);
	const currentVerseIndex = useMemo(
		() => readerVerses.findIndex((item) => item.verse === currentVerse),
		[readerVerses, currentVerse],
	);

	const getHebrewBookName = useCallback(
		(book: string): string => {
			const found = books.find(
				(item) => item.name.toLowerCase() === book.toLowerCase(),
			);
			if (
				besorahLanguage === "greek" &&
				found?.section === "besorah" &&
				GREEK_BESORAH_BOOK_NAMES[found.id]
			) {
				return GREEK_BESORAH_BOOK_NAMES[found.id];
			}
			return found?.hebrew_name ?? book;
		},
		[besorahLanguage, books],
	);

	const getDisplayBookName = useCallback(
		(book: string): string => {
			const found = books.find(
				(item) => item.name.toLowerCase() === book.toLowerCase(),
			);
			if (language === "es") {
				return formatBookDisplayName(found?.spanish_name || book);
			}
			return formatBookDisplayName(book);
		},
		[books, language],
	);

	const tabTitle = useMemo(() => {
		if (currentScreen === "terms") {
			return `${t("home.aboutItems.terms")} | ${t("common.appName")}`;
		}

		if (currentScreen === "privacy") {
			return `${t("home.aboutItems.privacy")} | ${t("common.appName")}`;
		}

		if (currentScreen !== "verse" || !currentBook || !currentChapter) {
			return t("common.appName");
		}

		const hebrewBookName = getHebrewBookName(currentBook);
		const chapterVerse = `${currentChapter}:${currentVerse}`;

		if (language === "he") {
			return `${hebrewBookName} ${chapterVerse} ${hebrewBookName}`;
		}

		const displayBookName = getDisplayBookName(currentBook);

		return `${displayBookName} ${chapterVerse} ${hebrewBookName}`;
	}, [
		currentBook,
		currentChapter,
		currentVerse,
		currentScreen,
		language,
		t,
		getHebrewBookName,
		getDisplayBookName,
	]);

	useDocumentTitle(tabTitle);

	useEffect(() => {
		let isMounted = true;
		const loadBooks = async () => {
			try {
				const response = await getBooks();
				if (!isMounted) return;
				setBooks(response);
				if (response.length > 0) {
					const hasCurrent = response.some(
						(item) => item.name.toLowerCase() === currentBook.toLowerCase(),
					);
					if (!hasCurrent) {
						setCurrentBook(response[0].name);
						setCurrentChapter(1);
						setCurrentVerse(1);
					}
				}
			} catch (error) {
				if (!isMounted) return;
				if (error instanceof Error && error.name === "NetworkError") {
					setCurrentScreen("connectionError");
				} else {
					setErrorMessage(translate(language, "errors.loadBooks"));
				}
			}
		};
		loadBooks();
		return () => {
			isMounted = false;
		};
	}, [
		currentBook,
		language,
		setCurrentBook,
		setCurrentChapter,
		setCurrentScreen,
		setCurrentVerse,
	]);

	useEffect(() => {
		let isMounted = true;
		const loadRequestId = ++chapterLoadRequestRef.current;
		const isCurrentLoad = () =>
			isMounted && loadRequestId === chapterLoadRequestRef.current;
		const loadChapterData = async () => {
			setErrorMessage(null);
			const loadingGreekSource =
				greekAvailable &&
				isBesorah &&
				besorahLanguage === "greek" &&
				!translationOnly;
			const greekOverlayLanguage = loadingGreekSource
				? resolveGreekOverlayLanguage(language, translationOnly)
				: undefined;
			const readingLanguage = hebrewReadingLanguage(language, translationOnly);
			const chapterOptions = {
				language: readingLanguage,
				hebrewOnly: false as const,
				referenceMode: translationOnly
					? ("translation" as const)
					: ("source" as const),
				besorahTextVersion,
			};
			// Hebrew (or Greek) is enough to put the verse on screen. The translation
			// file is the whole book, so it must not hold the words back.
			const sourceFirst = !loadingGreekSource && !translationOnly;
			const identity = readerChapterIdentity(
				currentBook,
				currentChapter,
				readerSourceMode({
					useGreekSource: loadingGreekSource,
					translationOnly,
					besorahTextVersion,
				}),
			);
			const preview = loadingGreekSource
				? {
						full: peekGreekChapterVerses(currentBook, currentChapter, {
							language: greekOverlayLanguage,
						}),
						source: null,
					}
				: readyHebrewChapter(currentBook, currentChapter, {
						language: readingLanguage,
						showDss: showQumran,
						referenceMode: chapterOptions.referenceMode,
						besorahTextVersion,
						sourceFirst,
					});
			if (!preview.full && !preview.source) {
				setIsLoading(true);
			}
			try {
				const [chapterCountValue, verseCountValue, loadedVerses] =
					await Promise.all([
						getChapterCount(currentBook.toLowerCase()),
						getVerseCount(currentBook.toLowerCase(), currentChapter),
						preview.full
							? Promise.resolve(preview.full)
							: loadingGreekSource
								? getGreekChapterVerses(
										currentBook.toLowerCase(),
										currentChapter,
										{
											language: greekOverlayLanguage,
										},
									)
								: getChapterVerses(
										currentBook.toLowerCase(),
										currentChapter,
										sourceFirst
											? {
													...chapterOptions,
													hebrewOnly: true,
													language: undefined,
													showDss: false,
												}
											: {
													...chapterOptions,
													showDss: false,
												},
									),
					]);
				const verses = loadingGreekSource
					? Array.from({ length: verseCountValue }, (_, index) => {
							const verseNumber = index + 1;
							return (
								loadedVerses.find((verse) => verse.verse === verseNumber) ?? {
									available: false,
									chapter: currentChapter,
									edition: "sblgnt",
									hebrew: "",
									revision: undefined,
									sourceChapter: currentChapter,
									sourceVerse: verseNumber,
									source_language: "greek" as const,
									text: "",
									verse: verseNumber,
									words: [],
								}
							);
						})
					: loadedVerses;
				const displayedVerseCount = translationOnly
					? verses.length
					: verseCountValue;
				if (!isCurrentLoad()) return;
				setChapterCount(chapterCountValue);
				setVerseCount(displayedVerseCount);
				setChapterVerses(verses);
				setPublishedIdentity(identity);
				setTranslationPending(
					preview.full || !sourceFirst ? false : Boolean(readingLanguage),
				);
				if (verses.length > 0) {
					const availableVerseNumbers = verses
						.map((verse) => verse.verse)
						.filter(
							(verseNumber) => Number.isFinite(verseNumber) && verseNumber > 0,
						);

					if (availableVerseNumbers.length > 0) {
						const availableVerseSet = new Set(availableVerseNumbers);
						const fallbackVerse = availableVerseNumbers[0];
						setCurrentVerse((prevVerse) =>
							availableVerseSet.has(prevVerse) ? prevVerse : fallbackVerse,
						);
					}
				}
				if (isCurrentLoad()) setIsLoading(false);

				const enrichWithTranslation = sourceFirst && Boolean(readingLanguage);
				const enrichWithQumran = !loadingGreekSource && showQumran;
				const enrichReady = Boolean(
					peekChapterVerses(currentBook, currentChapter, {
						...chapterOptions,
						showDss: showQumran,
					}),
				);
				if ((enrichWithTranslation || enrichWithQumran) && !enrichReady) {
					if (enrichWithTranslation && !preview.full) {
						setTranslationPending(true);
					}
					try {
						const enrichedVerses = await getChapterVerses(
							currentBook.toLowerCase(),
							currentChapter,
							{
								...chapterOptions,
								showDss: showQumran,
							},
						);
						if (!isCurrentLoad()) return;
						setChapterVerses(enrichedVerses);
						setPublishedIdentity(identity);
					} catch (error) {
						console.error("Failed to load chapter translation", error);
					} finally {
						if (isCurrentLoad()) setTranslationPending(false);
					}
				}

				const scheduleIdle =
					typeof window !== "undefined" && "requestIdleCallback" in window
						? window.requestIdleCallback.bind(window)
						: (callback: () => void) => window.setTimeout(callback, 200);
				scheduleIdle(() => {
					if (!isCurrentLoad()) return;
					if (loadingGreekSource) {
						const greekOptions = { language: greekOverlayLanguage };
						prefetchGreekChapter(
							currentBook.toLowerCase(),
							currentChapter + 1,
							greekOptions,
						);
						if (currentChapter > 1) {
							prefetchGreekChapter(
								currentBook.toLowerCase(),
								currentChapter - 1,
								greekOptions,
							);
						}
						return;
					}
					prefetchChapterResources(
						currentBook.toLowerCase(),
						currentChapter + 1,
						chapterOptions,
					);
					if (currentChapter > 1) {
						prefetchChapterResources(
							currentBook.toLowerCase(),
							currentChapter - 1,
							chapterOptions,
						);
					}
				});
			} catch (error) {
				if (!isCurrentLoad()) return;
				if (!preview.full && !preview.source) {
					setPublishedIdentity(identity);
					setChapterVerses([]);
					setTranslationPending(false);
				}
				console.error("Failed to load chapter data", error);
				if (error instanceof Error && error.name === "NetworkError") {
					setCurrentScreen("connectionError");
				} else {
					setErrorMessage(translate(language, "errors.loadVerses"));
				}
			} finally {
				if (isCurrentLoad()) setIsLoading(false);
			}
		};
		if (currentBook) {
			loadChapterData();
		}
		return () => {
			isMounted = false;
		};
	}, [
		besorahLanguage,
		besorahTextVersion,
		currentBook,
		currentChapter,
		language,
		showQumran,
		translationOnly,
		isBesorah,
		greekAvailable,
		setCurrentScreen,
		setCurrentVerse,
	]);

	const handlePreviousVerse = useCallback(async () => {
		if (translationOnly) {
			if (currentVerseIndex > 0) {
				setCurrentVerse(readerVerses[currentVerseIndex - 1].verse);
				return true;
			}

			if (currentChapter > 1) {
				try {
					const previousChapter = currentChapter - 1;
					const translationLanguage = language === "es" ? "es" : "en";
					const previousChapterVerses = await getChapterVerses(
						currentBook.toLowerCase(),
						previousChapter,
						{
							language: translationLanguage,
							showDss: showQumran,
							hebrewOnly: false,
							referenceMode: "translation",
						},
					);
					const lastVerse = previousChapterVerses.at(-1)?.verse ?? 1;
					setCurrentChapter(previousChapter);
					setCurrentVerse(lastVerse);
					return true;
				} catch {
					return false;
				}
			}

			return false;
		}

		if (currentVerse > 1) {
			setCurrentVerse(currentVerse - 1);
			return true;
		}

		if (currentChapter > 1) {
			try {
				const previousChapter = currentChapter - 1;
				const previousVerseCount = await getVerseCount(
					currentBook.toLowerCase(),
					previousChapter,
				);
				setCurrentChapter(previousChapter);
				setCurrentVerse(previousVerseCount);
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}, [
		readerVerses,
		currentBook,
		currentChapter,
		currentVerse,
		currentVerseIndex,
		language,
		setCurrentChapter,
		setCurrentVerse,
		showQumran,
		translationOnly,
	]);

	const handleNextVerse = useCallback(async () => {
		if (translationOnly) {
			if (
				currentVerseIndex >= 0 &&
				currentVerseIndex < readerVerses.length - 1
			) {
				setCurrentVerse(readerVerses[currentVerseIndex + 1].verse);
				return true;
			}

			if (currentChapter < chapterCount) {
				try {
					const nextChapter = currentChapter + 1;
					const translationLanguage = language === "es" ? "es" : "en";
					const nextChapterVerses = await getChapterVerses(
						currentBook.toLowerCase(),
						nextChapter,
						{
							language: translationLanguage,
							showDss: showQumran,
							hebrewOnly: false,
							referenceMode: "translation",
						},
					);
					const firstVerse = nextChapterVerses[0]?.verse ?? 1;
					setCurrentChapter(nextChapter);
					setCurrentVerse(firstVerse);
					return true;
				} catch {
					return false;
				}
			}

			return false;
		}

		if (currentVerse < verseCount) {
			setCurrentVerse(currentVerse + 1);
			return true;
		}

		if (currentChapter < chapterCount) {
			setCurrentChapter(currentChapter + 1);
			setCurrentVerse(1);
			return true;
		}
		return false;
	}, [
		chapterCount,
		readerVerses,
		currentBook,
		currentChapter,
		currentVerse,
		currentVerseIndex,
		language,
		setCurrentChapter,
		setCurrentVerse,
		showQumran,
		translationOnly,
		verseCount,
	]);

	return {
		books,
		chapterVerses: readerVerses,
		chapterCount,
		verseCount,
		isLoading: readerLoading,
		translationPending: readerTranslationPending,
		currentVerseData,
		currentVerseIndex,
		bookOptions,
		isBesorah,
		getHebrewBookName,
		getDisplayBookName,
		handlePreviousVerse,
		handleNextVerse,
	};
}
