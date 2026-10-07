import { useEffect, useRef, useState } from "react";
import type { RouteScreen } from "../../utils/routeState";
import { useVerseScrollNavigation } from "../../utils/useVerseScrollNavigation";

export function useReaderChrome({
	isMobile,
	currentScreen,
	showFullChapter,
	seferMode,
	settingsOpen,
	isWordPanelHovered,
	handleNextVerse,
	handlePreviousVerse,
	triggerScrollJump,
}: {
	isMobile: boolean;
	currentScreen: RouteScreen;
	showFullChapter: boolean;
	seferMode: boolean;
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

	useEffect(() => {
		if (isMobile) {
			const threshold = 24;
			lastScrollYRef.current = window.scrollY;

			const handleMobileScroll = () => {
				const currentY = window.scrollY;
				const delta = currentY - lastScrollYRef.current;

				if (currentY <= threshold) {
					setHideNavOnScroll(false);
				} else if (delta > 4) {
					setHideNavOnScroll(true);
				} else if (delta < -4) {
					setHideNavOnScroll(false);
				}

				lastScrollYRef.current = currentY;
			};

			handleMobileScroll();
			window.addEventListener("scroll", handleMobileScroll, { passive: true });
			return () => window.removeEventListener("scroll", handleMobileScroll);
		}

		if (!(currentScreen === "verse" && showFullChapter && seferMode)) {
			setHideNavOnScroll(false);
			return;
		}

		const handleScroll = () => {
			setHideNavOnScroll(window.scrollY > 40);
		};

		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [currentScreen, isMobile, showFullChapter, seferMode]);

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
