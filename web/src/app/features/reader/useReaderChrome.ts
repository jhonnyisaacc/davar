import { useEffect, useRef, useState } from "react";
import type { RouteScreen } from "../../utils/routeState";
import { useVerseScrollNavigation } from "../../utils/useVerseScrollNavigation";

const NAV_SCROLL_TOP = 24;
const NAV_SCROLL_DELTA = 4;
const NAV_LAYOUT_LOCK_MS = 350;

export function nextNavHidden(
	currentY: number,
	previousY: number,
): boolean | null {
	const delta = currentY - previousY;
	if (currentY <= NAV_SCROLL_TOP) return false;
	if (delta > NAV_SCROLL_DELTA) return true;
	if (delta < -NAV_SCROLL_DELTA) return false;
	return null;
}

export function readerNavTracksScroll({
	isMobile,
	currentScreen,
	showFullChapter,
}: {
	isMobile: boolean;
	currentScreen: RouteScreen;
	showFullChapter: boolean;
}): boolean {
	return isMobile || (currentScreen === "verse" && showFullChapter);
}

export function useReaderChrome({
	isMobile,
	currentScreen,
	showFullChapter,
	settingsOpen,
	isWordPanelHovered,
	handleNextVerse,
	handlePreviousVerse,
	triggerScrollJump,
}: {
	isMobile: boolean;
	currentScreen: RouteScreen;
	showFullChapter: boolean;
	settingsOpen: boolean;
	isWordPanelHovered: boolean;
	handleNextVerse: () => boolean | Promise<boolean>;
	handlePreviousVerse: () => boolean | Promise<boolean>;
	triggerScrollJump: () => void;
}) {
	const [hideNavOnScroll, setHideNavOnScroll] = useState(false);
	const lastScrollYRef = useRef(0);
	const [showMobileDesignGuide, setShowMobileDesignGuide] = useState(false);
	const [showDesignSystem, setShowDesignSystem] = useState(false);
	const versePanelRef = useRef<HTMLDivElement | null>(null);
	const isScrollNavigationActive =
		currentScreen === "verse" && !showFullChapter && !isMobile;
	const tracksScroll = readerNavTracksScroll({
		isMobile,
		currentScreen,
		showFullChapter,
	});

	useEffect(() => {
		if (!tracksScroll) {
			setHideNavOnScroll(false);
			return;
		}

		lastScrollYRef.current = window.scrollY;
		let lockUntil = 0;

		const handleScroll = () => {
			const currentY = window.scrollY;
			if (performance.now() < lockUntil) {
				lastScrollYRef.current = currentY;
				return;
			}

			const next = nextNavHidden(currentY, lastScrollYRef.current);
			lastScrollYRef.current = currentY;
			if (next === null) return;
			setHideNavOnScroll((previous) => {
				if (previous === next) return previous;
				lockUntil = performance.now() + NAV_LAYOUT_LOCK_MS;
				return next;
			});
		};

		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [tracksScroll]);

	useVerseScrollNavigation({
		containerRef: versePanelRef,
		isEnabled: isScrollNavigationActive,
		isBlocked: isWordPanelHovered || settingsOpen,
		threshold: 36,
		cooldownMs: 500,
		onNavigateNext: handleNextVerse,
		onNavigatePrevious: handlePreviousVerse,
		onNavigateFeedback: triggerScrollJump,
	});

	return {
		hideNavOnScroll,
		versePanelRef,
		isScrollNavigationActive,
		showDesignSystem,
		setShowDesignSystem,
		showMobileDesignGuide,
		setShowMobileDesignGuide,
	};
}
