import { parseSourceStrong } from "@davar/shared/greekBesorah";
import { isCurrentLexiconResult } from "@davar/shared/lexiconAssets";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type BookResponse,
	loadGreekLexiconEntry,
	loadGreekLexiconInstances,
	loadLexiconEntry,
	loadLexiconInstances,
	lookupBook,
	type VerseResponse,
	type WordAnalysis,
	type WordResponse,
} from "../../services/staticData";
import { stripCantillation, stripMeteg } from "../../utils/hebrew";

type WordSelectionContext = {
	chapter: number;
	verse: number;
};

const BOOK_ABBREVIATIONS: Record<string, string> = {
	gen: "Genesis",
	exod: "Exodus",
	ex: "Exodus",
	lev: "Leviticus",
	num: "Numbers",
	deut: "Deuteronomy",
	josh: "Joshua",
	judg: "Judges",
	ruth: "Ruth",
	"1sam": "Samuel1",
	"2sam": "Samuel2",
	"1kgs": "Kings1",
	"2kgs": "Kings2",
	"1chr": "Chronicles1",
	"2chr": "Chronicles2",
	ezra: "Ezra",
	neh: "Nehemiah",
	esth: "Esther",
	job: "Job",
	ps: "Psalms",
	prov: "Proverbs",
	eccl: "Ecclesiastes",
	song: "SongOfSolomon",
	isa: "Isaiah",
	jer: "Jeremiah",
	ezek: "Ezekiel",
	dan: "Daniel",
	hos: "Hosea",
	joel: "Joel",
	amos: "Amos",
	obad: "Obadiah",
	jonah: "Jonah",
	mic: "Micah",
	nah: "Nahum",
	hab: "Habakkuk",
	zeph: "Zephaniah",
	hag: "Haggai",
	zech: "Zechariah",
	mal: "Malachi",
	matt: "Matthew",
	mark: "Mark",
	luke: "Luke",
	john: "John",
	acts: "Acts",
	rom: "Romans",
	"1cor": "Corinthians1",
	"2cor": "Corinthians2",
	gal: "Galatians",
	eph: "Ephesians",
	phil: "Philippians",
	col: "Colossians",
	"1thess": "Thessalonians1",
	"2thess": "Thessalonians2",
	"1tim": "Timothy1",
	"2tim": "Timothy2",
	tit: "Titus",
	phlm: "Philemon",
	phlm2: "Philemon",
	heb: "Hebrews",
	jas: "James",
	"1pet": "Peter1",
	"2pet": "Peter2",
	"1john": "John1",
	"2john": "John2",
	"3john": "John3",
	jude: "Jude",
	rev: "Revelation",
};

export function useWordSelection({
	books,
	currentBook,
	currentChapter,
	currentVerse,
	currentScreen,
	currentVerseData,
	chapterVerses,
	setChapterVerses,
	language,
	besorahTextVersion,
	setCurrentBook,
	setCurrentChapter,
	setCurrentVerse,
}: {
	books: BookResponse[];
	currentBook: string;
	currentChapter: number;
	currentVerse: number;
	currentScreen: string;
	currentVerseData: VerseResponse | null;
	chapterVerses: VerseResponse[];
	setChapterVerses: Dispatch<SetStateAction<VerseResponse[]>>;
	language: "en" | "es" | "he";
	besorahTextVersion: "delitzsch" | "hutter";
	setCurrentBook: (book: string) => void;
	setCurrentChapter: (chapter: number) => void;
	setCurrentVerse: (verse: number) => void;
}) {
	const prevBookRef = useRef(currentBook);
	const [isWordPanelHovered, setIsWordPanelHovered] = useState(false);
	const [selectedWord, setSelectedWord] = useState<WordResponse | null>(null);
	const [selectedWordContext, setSelectedWordContext] =
		useState<WordSelectionContext | null>(null);
	const [isWordSheetOpen, setIsWordSheetOpen] = useState(false);
	const wordSheetClosingRef = useRef(false);
	const [isWordPanelDismissed, setIsWordPanelDismissed] = useState(true);
	const [showWordHint, _setShowWordHint] = useState(true);
	const [isNavigatingWordPanel, setIsNavigatingWordPanel] = useState(false);
	const [showWordSkeleton, setShowWordSkeleton] = useState(false);
	const navigationKeyRef = useRef<string | null>(null);
	const wordSkeletonTimerRef = useRef<number | null>(null);
	const wordPanelDismissedRef = useRef(true);
	const [lastSelectedWord, setLastSelectedWord] = useState<WordResponse | null>(
		null,
	);
	const [lastSelectedWordContext, setLastSelectedWordContext] =
		useState<WordSelectionContext | null>(null);
	const [lastSelectedWordAnalysis, setLastSelectedWordAnalysis] =
		useState<WordAnalysis | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const [selectedWordAnalysis, setSelectedWordAnalysis] =
		useState<WordAnalysis | null>(null);
	const [isWordAnalysisLoading, setIsWordAnalysisLoading] = useState(false);
	const wordAnalysisRequestRef = useRef(0);
	const dssAnalysisRequestRef = useRef(0);
	const [selectedDssAnalysis, setSelectedDssAnalysis] =
		useState<WordAnalysis | null>(null);
	const [lastSelectedDssAnalysis, setLastSelectedDssAnalysis] =
		useState<WordAnalysis | null>(null);
	const [isDssAnalysisLoading, setIsDssAnalysisLoading] = useState(false);
	const preserveWordRef = useRef(false);
	const pendingWordTextRef = useRef<string | null>(null);
	const pendingWordStrongRef = useRef<string | null>(null);
	const pendingWordRef = useRef<WordResponse | null>(null);
	const [wordCardTabKey, setWordCardTabKey] = useState(0);
	const [isWordPanelVisible, setIsWordPanelVisible] = useState(false);

	const getTransliterationForLanguage = useCallback(
		(word?: WordResponse | null) => {
			if (!word) return undefined;
			if (language === "en") return word.translit_en;
			if (language === "es") return word.translit_es;
			return word.translit_he;
		},
		[language],
	);

	const getAnalysisTransliterationForLanguage = useCallback(
		(analysis?: WordAnalysis | null) => {
			if (!analysis) return undefined;
			if (language === "en") return analysis.translit_en;
			if (language === "es") return analysis.translit_es;
			return analysis.translit_he;
		},
		[language],
	);

	const resolveRenderableDssWord = useCallback((value?: string) => {
		if (!value) return undefined;
		const trimmed = value.trim();
		if (!trimmed || trimmed.toLowerCase() === "note") {
			return undefined;
		}

		const tokenCount = trimmed
			.replace(/[/:]/g, " ")
			.split(/\s+/)
			.filter(Boolean).length;
		if (tokenCount < 1) {
			return undefined;
		}

		return trimmed;
	}, []);

	const closeWordSheet = useCallback(() => {
		wordSheetClosingRef.current = true;
		setIsWordSheetOpen(false);
	}, []);

	const logWordDebug = useCallback((...args: unknown[]) => {
		if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
			console.debug("[word-debug]", ...args);
		}
	}, []);

	const handleWordSheetAfterClose = useCallback(() => {
		if (isWordSheetOpen) return;
		wordSheetClosingRef.current = false;
		setSelectedWord(null);
		setSelectedWordContext(null);
	}, [isWordSheetOpen]);

	const handleWordClick = useCallback(
		(word: WordResponse, context?: WordSelectionContext) => {
			if (besorahTextVersion === "hutter" && !word.strong) {
				return;
			}
			const resolvedContext = context ?? {
				chapter: currentChapter,
				verse: currentVerse,
			};
			logWordDebug("click", {
				text: word.text,
				strong: word.strong ?? null,
				position: word.position,
				context: resolvedContext,
				selected: selectedWord
					? {
							text: selectedWord.text,
							strong: selectedWord.strong ?? null,
							position: selectedWord.position,
							context: selectedWordContext,
						}
					: null,
			});

			if (
				selectedWord?.text === word.text &&
				selectedWord?.strong === word.strong &&
				selectedWord?.position === word.position &&
				selectedWordContext?.chapter === resolvedContext.chapter &&
				selectedWordContext?.verse === resolvedContext.verse
			) {
				logWordDebug("click-same-word-close", {
					text: word.text,
					strong: word.strong ?? null,
					position: word.position,
					context: resolvedContext,
				});
				if (isMobile) {
					closeWordSheet();
				} else {
					setIsWordPanelDismissed(true);
					setSelectedWord(null);
					setSelectedWordContext(null);
					setLastSelectedWordAnalysis(null);
					setLastSelectedDssAnalysis(null);
				}
				return;
			}
			setIsWordPanelDismissed(false);
			setSelectedWord(word);
			setSelectedWordContext(resolvedContext);
			setSelectedWordAnalysis(null);
			setSelectedDssAnalysis(null);
			setIsWordAnalysisLoading(Boolean(parseSourceStrong(word.strong)));
			setIsDssAnalysisLoading(false);
			logWordDebug("click-select-word", {
				text: word.text,
				strong: word.strong ?? null,
				position: word.position,
				context: resolvedContext,
				isMobile,
			});
			if (isMobile) {
				wordSheetClosingRef.current = false;
				setIsWordSheetOpen(true);
			}
		},
		[
			besorahTextVersion,
			closeWordSheet,
			currentChapter,
			currentVerse,
			isMobile,
			logWordDebug,
			selectedWord,
			selectedWordContext,
		],
	);

	const handleNavigateToVerse = async (verseRef: string) => {
		const wordToPreserve = selectedWord ?? lastSelectedWord;
		if (wordToPreserve) {
			preserveWordRef.current = true;
			pendingWordTextRef.current = wordToPreserve.text;
			pendingWordStrongRef.current = wordToPreserve.strong ?? null;
			pendingWordRef.current = wordToPreserve;
			setIsWordPanelDismissed(false);
			setWordCardTabKey((previous) => previous + 1);
		}
		const cleanedRef = verseRef.replace(/\s+/g, " ").trim();
		const lastSpaceIndex = cleanedRef.lastIndexOf(" ");
		if (lastSpaceIndex <= 0) return;

		const bookLabel = cleanedRef.slice(0, lastSpaceIndex).trim();
		const chapterVerse = cleanedRef.slice(lastSpaceIndex + 1).trim();
		const match = chapterVerse.match(/^(\d+):(\d+)$/);
		if (!match) return;

		const chapter = Number.parseInt(match[1], 10);
		const verse = Number.parseInt(match[2], 10);
		if (Number.isNaN(chapter) || Number.isNaN(verse)) return;

		const normalizedBookLabel = bookLabel.toLowerCase().replace(/\./g, "");
		const abbreviationMatch = BOOK_ABBREVIATIONS[normalizedBookLabel];

		const matchedBook = books.find((item) => {
			const label = normalizedBookLabel;
			return (
				item.name.toLowerCase() === label ||
				item.hebrew_name?.toLowerCase() === label ||
				item.spanish_name?.toLowerCase() === label
			);
		});

		let resolvedBookName = matchedBook?.name ?? abbreviationMatch ?? bookLabel;
		if (!matchedBook && !abbreviationMatch) {
			try {
				const resolved = await lookupBook(bookLabel);
				resolvedBookName = resolved.name;
			} catch (error) {
				console.error("Failed to normalize book label:", error);
			}
		}

		setCurrentBook(resolvedBookName);
		setCurrentChapter(chapter);
		setCurrentVerse(verse);
		if (isMobile) {
			closeWordSheet();
		} else {
			setIsWordPanelDismissed(false);
		}
	};

	const selectedWordVerseData = useMemo(() => {
		const context = selectedWordContext ?? lastSelectedWordContext;
		if (!context) return currentVerseData;

		return (
			chapterVerses.find(
				(item) =>
					item.chapter === context.chapter && item.verse === context.verse,
			) ?? currentVerseData
		);
	}, [
		chapterVerses,
		currentVerseData,
		lastSelectedWordContext,
		selectedWordContext,
	]);

	const highlightedWord = useMemo(
		() => selectedWord ?? lastSelectedWord,
		[selectedWord, lastSelectedWord],
	);

	const highlightedWordContext = useMemo(() => {
		if (selectedWord && selectedWordContext) {
			return selectedWordContext;
		}

		if (!selectedWord && lastSelectedWordContext) {
			return lastSelectedWordContext;
		}

		return null;
	}, [selectedWord, selectedWordContext, lastSelectedWordContext]);

	const selectedDssVariant = useMemo(
		() =>
			selectedWordVerseData?.dss?.find(
				(variant) => variant.position === selectedWord?.position,
			) ?? null,
		[selectedWord, selectedWordVerseData],
	);

	const isSplitView = Boolean(
		!isMobile && (selectedWord || isNavigatingWordPanel),
	);
	const isWordPanelActive =
		!isMobile &&
		!isWordPanelDismissed &&
		(selectedWord || isNavigatingWordPanel);
	const shouldShowWordSkeleton =
		isWordPanelActive &&
		isNavigatingWordPanel &&
		showWordSkeleton &&
		!selectedWord;

	useEffect(() => {
		if (prevBookRef.current !== currentBook) {
			setSelectedWord(null);
			setSelectedWordContext(null);
			setSelectedWordAnalysis(null);
			setChapterVerses([]);
			prevBookRef.current = currentBook;
		}
	}, [currentBook, setChapterVerses]);

	useEffect(() => {
		if (currentScreen === "verse") return;

		wordSheetClosingRef.current = false;
		setIsWordSheetOpen(false);
		setIsWordPanelHovered(false);
		setIsNavigatingWordPanel(false);
		setShowWordSkeleton(false);
		setSelectedWord(null);
		setSelectedWordContext(null);
	}, [currentScreen]);

	useEffect(() => {
		let isMounted = true;
		const requestId = ++wordAnalysisRequestRef.current;
		const isCurrentRequest = () =>
			isMounted && requestId === wordAnalysisRequestRef.current;
		const loadWordAnalysis = async () => {
			if (!selectedWord?.strong) {
				logWordDebug("analysis-skip-no-strong", {
					text: selectedWord?.text ?? null,
					strong: selectedWord?.strong ?? null,
					position: selectedWord?.position ?? null,
				});
				setSelectedWordAnalysis(null);
				setLastSelectedWordAnalysis(null);
				setIsWordAnalysisLoading(false);
				return;
			}

			const strongPart = parseSourceStrong(selectedWord.strong);

			if (!strongPart) {
				logWordDebug("analysis-skip-invalid-strong", {
					strong: selectedWord.strong,
				});
				setSelectedWordAnalysis(null);
				setLastSelectedWordAnalysis(null);
				setIsWordAnalysisLoading(false);
				return;
			}

			setSelectedWordAnalysis(null);
			setIsWordAnalysisLoading(true);
			logWordDebug("analysis-load-start", {
				strong: strongPart,
				language,
			});
			try {
				const analysis =
					selectedWord.source_language === "greek"
						? await loadGreekLexiconEntry(strongPart, language)
						: await loadLexiconEntry(
								strongPart,
								language === "he" ? "en" : language,
							);
				if (!isCurrentRequest()) {
					return;
				}
				if (
					analysis &&
					!isCurrentLexiconResult(strongPart, analysis.strong_number)
				) {
					setIsWordAnalysisLoading(false);
					return;
				}
				setSelectedWordAnalysis(analysis);
				setIsWordAnalysisLoading(false);
				logWordDebug("analysis-load-success", {
					strong: strongPart,
					hasDefinitions: Boolean(analysis?.definitions?.length),
				});
				if (analysis?.has_instances_asset) {
					const instances =
						analysis.source_language === "greek"
							? await loadGreekLexiconInstances(
									analysis.strong_number,
									analysis.revision,
								)
							: await loadLexiconInstances(analysis.strong_number);
					if (!isCurrentRequest() || !instances) return;
					setSelectedWordAnalysis((current) =>
						current && isCurrentLexiconResult(strongPart, current.strong_number)
							? { ...current, ...instances }
							: current,
					);
				}
			} catch (error) {
				if (isCurrentRequest()) {
					logWordDebug("analysis-load-error", {
						strong: strongPart,
						error,
					});
					console.error("Failed to load word analysis", error);
					setSelectedWordAnalysis(null);
					setLastSelectedWordAnalysis(null);
					setIsWordAnalysisLoading(false);
				}
			}
		};
		loadWordAnalysis();
		return () => {
			isMounted = false;
		};
	}, [selectedWord, language, logWordDebug]);

	useEffect(() => {
		let isMounted = true;
		const requestId = ++dssAnalysisRequestRef.current;
		const isCurrentRequest = () =>
			isMounted && requestId === dssAnalysisRequestRef.current;
		const loadDssAnalysis = async () => {
			const dssStrong = selectedDssVariant?.dss_strong ?? null;
			if (!dssStrong) {
				setSelectedDssAnalysis(null);
				setLastSelectedDssAnalysis(null);
				setIsDssAnalysisLoading(false);
				return;
			}

			const strongPart = dssStrong
				.split("/")
				.map((part) => part.trim())
				.find((part) => /^[HGD]\d+$/.test(part));

			if (!strongPart) {
				setSelectedDssAnalysis(null);
				setLastSelectedDssAnalysis(null);
				setIsDssAnalysisLoading(false);
				return;
			}

			setSelectedDssAnalysis(null);
			setIsDssAnalysisLoading(true);
			try {
				const analysis = await loadLexiconEntry(
					strongPart,
					language === "he" ? "en" : language,
				);
				if (!isCurrentRequest()) {
					return;
				}
				if (
					analysis &&
					!isCurrentLexiconResult(strongPart, analysis.strong_number)
				) {
					setIsDssAnalysisLoading(false);
					return;
				}
				setSelectedDssAnalysis(analysis);
				setIsDssAnalysisLoading(false);
			} catch (error) {
				if (isCurrentRequest()) {
					console.error("Failed to load DSS analysis", error);
					setSelectedDssAnalysis(null);
					setLastSelectedDssAnalysis(null);
					setIsDssAnalysisLoading(false);
				}
			}
		};
		loadDssAnalysis();
		return () => {
			isMounted = false;
		};
	}, [selectedDssVariant, language]);

	useEffect(() => {
		if (selectedWord) {
			setLastSelectedWord(selectedWord);
		}
	}, [selectedWord]);

	useEffect(() => {
		if (selectedWordContext) {
			setLastSelectedWordContext(selectedWordContext);
		}
	}, [selectedWordContext]);

	useEffect(() => {
		if (selectedWordAnalysis) {
			setLastSelectedWordAnalysis(selectedWordAnalysis);
		}
	}, [selectedWordAnalysis]);

	useEffect(() => {
		if (selectedDssAnalysis) {
			setLastSelectedDssAnalysis(selectedDssAnalysis);
		}
	}, [selectedDssAnalysis]);

	useEffect(() => {
		if (isWordPanelActive) {
			setIsWordPanelVisible(true);
			return undefined;
		}

		if (isWordPanelVisible) {
			const timeout = window.setTimeout(
				() => setIsWordPanelVisible(false),
				300,
			);
			return () => window.clearTimeout(timeout);
		}

		return undefined;
	}, [isWordPanelActive, isWordPanelVisible]);

	useEffect(() => {
		wordPanelDismissedRef.current = isWordPanelDismissed;
	}, [isWordPanelDismissed]);

	useEffect(() => {
		if (wordSkeletonTimerRef.current) {
			window.clearTimeout(wordSkeletonTimerRef.current);
			wordSkeletonTimerRef.current = null;
		}
		setShowWordSkeleton(false);

		if (isMobile) {
			setIsNavigatingWordPanel(false);
			return;
		}

		const navigationKey = `${currentBook}-${currentChapter}-${currentVerse}`;
		if (navigationKeyRef.current === navigationKey) return;
		navigationKeyRef.current = navigationKey;

		if (preserveWordRef.current) {
			setIsNavigatingWordPanel(false);
			setIsWordPanelDismissed(false);
			return;
		}

		setIsNavigatingWordPanel(false);
		setIsWordPanelDismissed(true);
		setSelectedWord(null);
		setSelectedWordContext(null);
	}, [currentBook, currentChapter, currentVerse, isMobile]);

	useEffect(() => {
		if (!currentVerseData || !preserveWordRef.current) return;

		const targetText = pendingWordTextRef.current;
		const targetStrong = pendingWordStrongRef.current;
		const fallbackWord = pendingWordRef.current;

		const normalize = (text: string) =>
			stripMeteg(stripCantillation(text)).replace(/\//g, "");

		let matchedWord: WordResponse | undefined;

		if (targetStrong) {
			matchedWord = currentVerseData.words?.find(
				(word) => word.strong === targetStrong,
			);
		}

		if (!matchedWord && targetText) {
			const normalizedTarget = normalize(targetText);
			matchedWord = currentVerseData.words?.find(
				(word) => normalize(word.text) === normalizedTarget,
			);
		}

		if (matchedWord) {
			setSelectedWord(matchedWord);
			setSelectedWordContext({
				chapter: currentVerseData.chapter,
				verse: currentVerseData.verse,
			});
			setIsWordPanelDismissed(false);
		} else if (fallbackWord) {
			setSelectedWord(fallbackWord);
			setSelectedWordContext({
				chapter: currentVerseData.chapter,
				verse: currentVerseData.verse,
			});
			setIsWordPanelDismissed(false);
		}

		preserveWordRef.current = false;
		pendingWordTextRef.current = null;
		pendingWordStrongRef.current = null;
		pendingWordRef.current = null;
	}, [currentVerseData]);

	useEffect(() => {
		if (!selectedWord) return;
		setIsNavigatingWordPanel(false);
		setShowWordSkeleton(false);
		if (wordSkeletonTimerRef.current) {
			window.clearTimeout(wordSkeletonTimerRef.current);
			wordSkeletonTimerRef.current = null;
		}
	}, [selectedWord]);

	useEffect(() => {
		return () => {
			if (wordSkeletonTimerRef.current) {
				window.clearTimeout(wordSkeletonTimerRef.current);
				wordSkeletonTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
		const update = () => setIsMobile(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		if (!isMobile) {
			wordSheetClosingRef.current = false;
			setIsWordSheetOpen(false);
			return;
		}

		if (!selectedWord) {
			setIsWordSheetOpen(false);
			return;
		}

		if (!wordSheetClosingRef.current) {
			setIsWordSheetOpen(true);
		}
	}, [isMobile, selectedWord]);

	useEffect(() => {
		if (!selectedWord || isMobile) {
			setIsWordPanelHovered(false);
		}
	}, [isMobile, selectedWord]);

	return {
		isMobile,
		selectedWord,
		setSelectedWord,
		selectedWordContext,
		setSelectedWordContext,
		isWordSheetOpen,
		setIsWordPanelDismissed,
		showWordHint,
		isNavigatingWordPanel,
		setIsNavigatingWordPanel,
		showWordSkeleton,
		setShowWordSkeleton,
		wordSkeletonTimerRef,
		lastSelectedWord,
		lastSelectedWordContext,
		lastSelectedWordAnalysis,
		selectedWordAnalysis,
		isWordAnalysisLoading,
		selectedDssAnalysis,
		lastSelectedDssAnalysis,
		isDssAnalysisLoading,
		wordCardTabKey,
		isWordPanelHovered,
		setIsWordPanelHovered,
		closeWordSheet,
		handleWordSheetAfterClose,
		handleWordClick,
		handleNavigateToVerse,
		getTransliterationForLanguage,
		getAnalysisTransliterationForLanguage,
		resolveRenderableDssWord,
		highlightedWord,
		highlightedWordContext,
		isSplitView,
		isWordPanelActive,
		isWordPanelVisible,
		shouldShowWordSkeleton,
	};
}
