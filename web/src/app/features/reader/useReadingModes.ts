import { useCallback, useEffect } from "react";
import type { VerseResponse } from "../../services/staticData";

export function useReadingModes({
	showFullChapter,
	seferMode,
	translationOnly,
	hebrewOnly,
	showQumran,
	showNikud,
	showCantillation,
	setShowFullChapter,
	setSeferMode,
	setTranslationOnly,
	setHebrewOnly,
	setShowQumran,
	setShowNikud,
	setShowCantillation,
	chapterVerses,
	currentVerse,
	setCurrentChapter,
	setCurrentVerse,
}: {
	showFullChapter: boolean;
	seferMode: boolean;
	translationOnly: boolean;
	hebrewOnly: boolean;
	showQumran: boolean;
	showNikud: boolean;
	showCantillation: boolean;
	setShowFullChapter: (value: boolean) => void;
	setSeferMode: (value: boolean) => void;
	setTranslationOnly: (value: boolean) => void;
	setHebrewOnly: (value: boolean) => void;
	setShowQumran: (value: boolean) => void;
	setShowNikud: (value: boolean) => void;
	setShowCantillation: (value: boolean) => void;
	chapterVerses: Pick<
		VerseResponse,
		"verse" | "sourceChapter" | "sourceVerse"
	>[];
	currentVerse: number;
	setCurrentChapter: (value: number) => void;
	setCurrentVerse: (value: number) => void;
}) {
	useEffect(() => {
		if (!showFullChapter && seferMode) {
			setSeferMode(false);
		}
	}, [showFullChapter, seferMode, setSeferMode]);

	useEffect(() => {
		if (!translationOnly) return;

		if (hebrewOnly) {
			setHebrewOnly(false);
		}
		if (showQumran) {
			setShowQumran(false);
		}
		if (showNikud) {
			setShowNikud(false);
		}
		if (showCantillation) {
			setShowCantillation(false);
		}
	}, [
		translationOnly,
		hebrewOnly,
		showQumran,
		showNikud,
		showCantillation,
		setHebrewOnly,
		setShowQumran,
		setShowNikud,
		setShowCantillation,
	]);

	const handleSeferModeChange = useCallback(
		(nextSeferMode: boolean) => {
			if (nextSeferMode) {
				if (!showFullChapter) {
					setShowFullChapter(true);
				}
				if (!hebrewOnly && !translationOnly) {
					setTranslationOnly(true);
				}
			}

			setSeferMode(nextSeferMode);
		},
		[
			showFullChapter,
			hebrewOnly,
			translationOnly,
			setShowFullChapter,
			setTranslationOnly,
			setSeferMode,
		],
	);

	const handleHebrewOnlyChange = useCallback(
		(nextHebrewOnly: boolean) => {
			setHebrewOnly(nextHebrewOnly);
			if (!nextHebrewOnly && !translationOnly && seferMode) {
				setSeferMode(false);
			}
		},
		[seferMode, setHebrewOnly, setSeferMode, translationOnly],
	);

	const handleTranslationOnlyChange = useCallback(
		(nextTranslationOnly: boolean) => {
			setTranslationOnly(nextTranslationOnly);
			const activeVerse =
				chapterVerses.find((item) => item.verse === currentVerse) ??
				chapterVerses[0];

			if (!nextTranslationOnly && activeVerse) {
				setCurrentChapter(activeVerse.sourceChapter);
				setCurrentVerse(activeVerse.sourceVerse);
			}

			if (nextTranslationOnly) {
				if (!showFullChapter) {
					setShowFullChapter(true);
				}
				if (!seferMode) {
					setSeferMode(true);
				}
				return;
			}

			setShowNikud(true);
			setShowQumran(true);
			setShowFullChapter(false);
			setSeferMode(false);
		},
		[
			chapterVerses,
			currentVerse,
			setCurrentChapter,
			setCurrentVerse,
			showFullChapter,
			seferMode,
			setTranslationOnly,
			setShowNikud,
			setShowQumran,
			setShowFullChapter,
			setSeferMode,
		],
	);

	return {
		handleSeferModeChange,
		handleHebrewOnlyChange,
		handleTranslationOnlyChange,
	};
}
