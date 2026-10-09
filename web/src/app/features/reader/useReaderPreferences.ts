import { useCallback, useEffect, useState } from "react";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useTranslation } from "../../hooks/useTranslation";
import { isGreekPreviewEnabled } from "../../services/staticData";
import type { ReadingStateV2 } from "../../utils/storageHelpers";

export function useReaderPreferences(initialState: ReadingStateV2) {
	const [theme, setTheme] = usePersistedState("theme", initialState.theme);
	const [language, setLanguage] = usePersistedState(
		"language",
		initialState.language,
	);
	const [besorahTextVersion, setBesorahTextVersion] = usePersistedState(
		"besorahTextVersion",
		initialState.besorahTextVersion,
	);
	const [besorahLanguage, setBesorahLanguage] = usePersistedState(
		"besorahLanguage",
		initialState.besorahLanguage,
	);
	const greekAvailable = isGreekPreviewEnabled();
	const { t, isRTL } = useTranslation(language);
	const [showQumran, setShowQumran] = usePersistedState(
		"showQumran",
		initialState.showQumran,
	);
	const [showFullChapter, setShowFullChapter] = usePersistedState(
		"showFullChapter",
		initialState.showFullChapter,
	);
	const [showCalendarDayPill, setShowCalendarDayPill] = usePersistedState(
		"showCalendarDayPill",
		initialState.showCalendarDayPill ?? false,
	);
	const [seferMode, setSeferMode] = usePersistedState(
		"seferMode",
		initialState.seferMode ?? false,
	);
	const [hebrewOnly, setHebrewOnly] = usePersistedState(
		"hebrewOnly",
		initialState.hebrewOnly,
	);
	const [translationOnly, setTranslationOnly] = usePersistedState(
		"translationOnly",
		initialState.translationOnly,
	);
	const [showNikud, setShowNikud] = usePersistedState(
		"showNikud",
		initialState.showNikud,
	);
	const [showCantillation, setShowCantillation] = usePersistedState(
		"showCantillation",
		initialState.showCantillation,
	);
	const [scrollHintCount, setScrollHintCount] = usePersistedState(
		"scrollNavHintCount",
		initialState.scrollNavHintCount,
	);
	const [desktopScrollHintCount, setDesktopScrollHintCount] = usePersistedState(
		"desktopScrollHintCount",
		initialState.desktopScrollHintCount,
	);
	const [scrollJumpActive, setScrollJumpActive] = useState(false);

	useEffect(() => {
		if (theme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}, [theme]);

	useEffect(() => {
		document.documentElement.dir = isRTL ? "rtl" : "ltr";
		document.documentElement.lang = language;
	}, [isRTL, language]);

	useEffect(() => {
		if (!scrollJumpActive) return undefined;
		const timeout = window.setTimeout(() => setScrollJumpActive(false), 240);
		return () => window.clearTimeout(timeout);
	}, [scrollJumpActive]);

	const handleBesorahTextVersionChange = useCallback(
		(version: "delitzsch" | "hutter") => {
			setBesorahTextVersion(version);
		},
		[setBesorahTextVersion],
	);

	const triggerScrollJump = useCallback(() => {
		if (scrollHintCount < 5) {
			setScrollJumpActive(true);
			setScrollHintCount(scrollHintCount + 1);
		}

		if (desktopScrollHintCount < 5) {
			setDesktopScrollHintCount(desktopScrollHintCount + 1);
		}
	}, [
		desktopScrollHintCount,
		scrollHintCount,
		setDesktopScrollHintCount,
		setScrollHintCount,
	]);

	return {
		theme,
		setTheme,
		language,
		setLanguage,
		besorahTextVersion,
		besorahLanguage,
		setBesorahLanguage,
		greekAvailable,
		t,
		showQumran,
		setShowQumran,
		showFullChapter,
		setShowFullChapter,
		showCalendarDayPill,
		setShowCalendarDayPill,
		seferMode,
		setSeferMode,
		hebrewOnly,
		setHebrewOnly,
		translationOnly,
		setTranslationOnly,
		showNikud,
		setShowNikud,
		showCantillation,
		setShowCantillation,
		desktopScrollHintCount,
		handleBesorahTextVersionChange,
		scrollJumpActive,
		triggerScrollJump,
	};
}
