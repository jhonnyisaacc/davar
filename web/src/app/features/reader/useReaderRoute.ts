import { useEffect, useRef } from "react";
import type { BookResponse } from "../../services/staticData";
import {
	buildRoutePath,
	findCanonicalBook,
	parseRoutePath,
	type RouteScreen,
	type RouteState,
} from "../../utils/routeState";

export function useReaderRoute({
	books,
	currentBook,
	currentChapter,
	currentVerse,
	currentScreen,
	setCurrentBook,
	setCurrentChapter,
	setCurrentVerse,
	setCurrentScreen,
	setSettingsOpen,
	handleOpenScreen,
}: {
	books: BookResponse[];
	currentBook: string;
	currentChapter: number;
	currentVerse: number;
	currentScreen: RouteScreen;
	setCurrentBook: (book: string) => void;
	setCurrentChapter: (chapter: number) => void;
	setCurrentVerse: (verse: number) => void;
	setCurrentScreen: (screen: RouteScreen) => void;
	setSettingsOpen: (open: boolean) => void;
	handleOpenScreen: (screen: RouteScreen) => void;
}) {
	const currentScreenRef = useRef(currentScreen);
	const booksRef = useRef<BookResponse[]>(books);
	const lastUrlRef = useRef<string | null>(null);
	const pendingRouteRef = useRef<RouteState | null | undefined>(undefined);
	const isHandlingPopStateRef = useRef(false);

	useEffect(() => {
		currentScreenRef.current = currentScreen;
	}, [currentScreen]);

	useEffect(() => {
		booksRef.current = books;
	}, [books]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const pathname = window.location.pathname;
		pendingRouteRef.current = parseRoutePath(pathname);
		lastUrlRef.current = pathname;
	}, []);

	useEffect(() => {
		const pending = pendingRouteRef.current;
		if (pending === undefined) return;
		if (pending === null) {
			setCurrentScreen("notFound");
			pendingRouteRef.current = undefined;
			return;
		}

		if (pending.screen !== "verse") {
			handleOpenScreen(pending.screen);
			pendingRouteRef.current = undefined;
			return;
		}

		if (pending.book && books.length === 0) {
			return;
		}

		if (pending.book) {
			const matchedBook = findCanonicalBook(books, pending.book);
			if (matchedBook) {
				setCurrentBook(matchedBook.name);
			} else {
				setCurrentScreen("notFound");
				pendingRouteRef.current = undefined;
				return;
			}
		}

		if (pending.chapter) {
			setCurrentChapter(pending.chapter);
		}

		if (pending.verse) {
			setCurrentVerse(pending.verse);
		}

		setCurrentScreen("verse");
		pendingRouteRef.current = undefined;
	}, [
		books,
		handleOpenScreen,
		setCurrentBook,
		setCurrentChapter,
		setCurrentScreen,
		setCurrentVerse,
	]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handlePopState = () => {
			isHandlingPopStateRef.current = true;
			const route = parseRoutePath(window.location.pathname);
			setSettingsOpen(route?.screen === "settings");

			if (!route) {
				setCurrentScreen("notFound");
				window.setTimeout(() => {
					isHandlingPopStateRef.current = false;
				}, 0);
				return;
			}

			if (route.screen !== "verse") {
				handleOpenScreen(route.screen);
			} else {
				if (
					["terms", "privacy", "feedback"].includes(currentScreenRef.current)
				) {
					setCurrentScreen("home");
				} else {
					if (route.book) {
						const matchedBook = findCanonicalBook(booksRef.current, route.book);
						if (matchedBook) {
							setCurrentBook(matchedBook.name);
						} else {
							setCurrentScreen("notFound");
							window.setTimeout(() => {
								isHandlingPopStateRef.current = false;
							}, 0);
							return;
						}
					}
					if (route.chapter) {
						setCurrentChapter(route.chapter);
					}
					if (route.verse) {
						setCurrentVerse(route.verse);
					}
					setCurrentScreen("verse");
				}
			}
			window.setTimeout(() => {
				isHandlingPopStateRef.current = false;
			}, 0);
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [
		handleOpenScreen,
		setCurrentBook,
		setCurrentChapter,
		setCurrentScreen,
		setCurrentVerse,
		setSettingsOpen,
	]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (isHandlingPopStateRef.current) return;

		const path = buildRoutePath({
			screen: currentScreen,
			book: currentBook,
			chapter: currentChapter,
			verse: currentVerse,
		});

		if (
			currentScreen === "notFound" &&
			parseRoutePath(window.location.pathname) === null
		) {
			return;
		}

		if (lastUrlRef.current === path) return;
		window.history.pushState(null, "", path);
		lastUrlRef.current = path;
	}, [currentBook, currentChapter, currentScreen, currentVerse]);

	useEffect(() => {
		const handleOnline = () => {
			if (currentScreen === "connectionError") {
				window.location.reload();
			}
		};

		const handleOffline = () => {
			setCurrentScreen("connectionError");
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [currentScreen, setCurrentScreen]);
}
