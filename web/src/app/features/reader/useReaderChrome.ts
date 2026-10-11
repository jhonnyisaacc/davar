import { type FocusEvent, useEffect, useRef, useState } from "react";
import type { RouteScreen } from "../../utils/routeState";
import { useVerseScrollNavigation } from "../../utils/useVerseScrollNavigation";

const NAV_SCROLL_TOP = 24;
const NAV_SCROLL_DELTA = 4;

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

export type ReaderNavPresence = "shown" | "hiddenByScroll" | "awaitingHover";

export function readerNavPresence({
	isMobile,
	currentScreen,
	showFullChapter,
	canHover,
	pointerOver,
	focusWithin,
	menuOpen,
	scrollHidden,
}: {
	isMobile: boolean;
	currentScreen: RouteScreen;
	showFullChapter: boolean;
	canHover: boolean;
	pointerOver: boolean;
	focusWithin: boolean;
	menuOpen: boolean;
	scrollHidden: boolean;
}): ReaderNavPresence {
	const revealsOnHover =
		canHover && isMobile && currentScreen === "verse" && !showFullChapter;
	if (!revealsOnHover) return scrollHidden ? "hiddenByScroll" : "shown";
	return pointerOver || focusWithin || menuOpen ? "shown" : "awaitingHover";
}

const HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function useReaderChrome({
	isMobile,
	currentScreen,
	showFullChapter,
	settingsOpen,
	selectionMenuOpen,
	isWordPanelHovered,
	handleNextVerse,
	handlePreviousVerse,
	triggerScrollJump,
}: {
	isMobile: boolean;
	currentScreen: RouteScreen;
	showFullChapter: boolean;
	settingsOpen: boolean;
	selectionMenuOpen: boolean;
	isWordPanelHovered: boolean;
	handleNextVerse: () => boolean | Promise<boolean>;
	handlePreviousVerse: () => boolean | Promise<boolean>;
	triggerScrollJump: () => void;
}) {
	const [hideNavOnScroll, setHideNavOnScroll] = useState(false);
	const lastScrollYRef = useRef(0);
	const [canHover, setCanHover] = useState(false);
	const [pointerOverNav, setPointerOverNav] = useState(false);
	const [keyboardFocusInNav, setKeyboardFocusInNav] = useState(false);
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

		const handleScroll = () => {
			const currentY = window.scrollY;
			const next = nextNavHidden(currentY, lastScrollYRef.current);
			lastScrollYRef.current = currentY;
			if (next === null) return;
			setHideNavOnScroll(next);
		};

		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [tracksScroll]);

	useEffect(() => {
		const media = window.matchMedia(HOVER_POINTER_QUERY);
		const update = () => setCanHover(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	const navRef = useRef<HTMLDivElement | null>(null);
	const menuOpen = settingsOpen || selectionMenuOpen;
	// The nav's own pointerleave is skipped when an open menu under the pointer unmounts.
	useEffect(() => {
		const handlePointerOver = (event: PointerEvent) =>
			setPointerOverNav(
				Boolean(navRef.current?.contains(event.target as Node | null)),
			);
		const handlePointerOut = (event: PointerEvent) => {
			if (!event.relatedTarget) setPointerOverNav(false);
		};
		document.addEventListener("pointerover", handlePointerOver);
		document.addEventListener("pointerout", handlePointerOut);
		return () => {
			document.removeEventListener("pointerover", handlePointerOver);
			document.removeEventListener("pointerout", handlePointerOut);
		};
	}, []);

	const navPresence = readerNavPresence({
		isMobile,
		currentScreen,
		showFullChapter,
		canHover,
		pointerOver: pointerOverNav,
		focusWithin: keyboardFocusInNav,
		menuOpen,
		scrollHidden: hideNavOnScroll,
	});

	// A focused menu input is removed without a blur event when its menu closes.
	useEffect(() => {
		if (menuOpen) return;
		const active = document.activeElement;
		setKeyboardFocusInNav(
			Boolean(
				active &&
					navRef.current?.contains(active) &&
					active.matches(":focus-visible"),
			),
		);
	}, [menuOpen]);

	const navHoverHandlers = {
		ref: navRef,
		// Mouse clicks leave focus on nav buttons; only keyboard focus should hold the bar open.
		onFocus: (event: FocusEvent<HTMLElement>) =>
			setKeyboardFocusInNav(event.target.matches(":focus-visible")),
		onBlur: (event: FocusEvent<HTMLElement>) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
				setKeyboardFocusInNav(false);
			}
		},
	};

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
		navPresence,
		navHoverHandlers,
		versePanelRef,
		isScrollNavigationActive,
		showDesignSystem,
		setShowDesignSystem,
		showMobileDesignGuide,
		setShowMobileDesignGuide,
	};
}
