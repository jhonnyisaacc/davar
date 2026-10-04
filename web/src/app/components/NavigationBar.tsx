import { BookOpen, ChevronLeft, ChevronRight, Paintbrush } from "lucide-react";
import {
	Fragment,
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	SHARED_SETTINGS_ORDER,
	canUseSeferStyle,
	isSeferStyleVisible,
	type SharedSettingId,
} from "@davar/shared/settingsOrder";
import { useTranslation } from "../hooks/useTranslation";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { formatBookDisplayName } from "../utils/bookNameFormatter";
import { PillToggle } from "./PillToggle";
import { CalendarCityNotice } from "./CalendarCityNotice";
import { SettingsResources } from "./SettingsResources";
import { productApi } from "../services/productApi";
import type { RouteScreen } from "../utils/routeState";
import { useProductCapabilities } from "../hooks/useProductCapabilities";

interface NavigationBarProps {
	activeDestination: RouteScreen;
	onDestinationClick: (screen: RouteScreen) => void;
	settingsOpen: boolean;
	onSettingsOpenChange: (open: boolean) => void;
	book: string;
	bookDisplayName: string;
	bookHebrew: string;
	chapter: number;
	verse: number;
	books: {
		name: string;
		hebrew: string;
		spanish: string;
		greek?: string;
		section?: string;
	}[];
	chapterCount: number;
	verseCount: number;
	onBookChange: (book: string) => void;
	onChapterChange: (chapter: number) => void;
	onVerseChange: (verse: number) => void;
	onDesignSystemClick?: () => void;
	onMobileDesignGuideClick?: () => void;
	theme: "light" | "dark";
	onThemeChange: (theme: "light" | "dark") => void;
	language: "en" | "es" | "he";
	onLanguageChange: (language: "en" | "es" | "he") => void;
	besorahLanguage: BesorahLanguage;
	onBesorahLanguageChange: (language: BesorahLanguage) => void;
	greekAvailable: boolean;
	besorahTextVersion: "delitzsch" | "hutter";
	onBesorahTextVersionChange: (version: "delitzsch" | "hutter") => void;
	showQumran: boolean;
	onQumranChange: (show: boolean) => void;
	showFullChapter: boolean;
	onFullChapterChange: (show: boolean) => void;
	showCalendarDayPill?: boolean;
	onCalendarDayPillChange?: (show: boolean) => void;
	seferMode: boolean;
	onSeferModeChange: (show: boolean) => void;
	hebrewOnly: boolean;
	onHebrewOnlyChange: (show: boolean) => void;
	showNikud: boolean;
	onNikudChange: (show: boolean) => void;
	showCantillation: boolean;
	onCantillationChange: (show: boolean) => void;
	translationOnly: boolean;
	onTranslationOnlyChange: (show: boolean) => void;
}

export function NavigationBar({
	activeDestination,
	onDestinationClick,
	settingsOpen,
	onSettingsOpenChange,
	book,
	bookDisplayName,
	bookHebrew,
	chapter,
	verse,
	books,
	chapterCount,
	verseCount,
	onBookChange,
	onChapterChange,
	onVerseChange,
	onDesignSystemClick,
	onMobileDesignGuideClick,
	theme,
	onThemeChange,
	language,
	onLanguageChange,
	besorahLanguage,
	onBesorahLanguageChange,
	greekAvailable,
	besorahTextVersion,
	onBesorahTextVersionChange,
	showQumran,
	onQumranChange,
	showFullChapter,
	onFullChapterChange,
	showCalendarDayPill = false,
	onCalendarDayPillChange,
	seferMode,
	onSeferModeChange,
	hebrewOnly,
	onHebrewOnlyChange,
	showNikud,
	onNikudChange,
	showCantillation,
	onCantillationChange,
	translationOnly,
	onTranslationOnlyChange,
}: NavigationBarProps) {
	const { capabilities } = useProductCapabilities();
	const [selectionMenu, setSelectionMenu] = useState<
		"book" | "chapter" | "verse" | null
	>(null);
	const [scriptureNavigationCollapsed, setScriptureNavigationCollapsed] =
		useState(false);
	const openMenu = settingsOpen ? "settings" : selectionMenu;
	const setOpenMenu = useCallback(
		(menu: typeof openMenu) => {
			setSelectionMenu(menu === "settings" ? null : menu);
			onSettingsOpenChange(menu === "settings");
		},
		[onSettingsOpenChange],
	);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const bookListRef = useRef<HTMLDivElement>(null);
	const bookSearchRef = useRef<HTMLInputElement>(null);
	const chapterSearchRef = useRef<HTMLInputElement>(null);
	const verseSearchRef = useRef<HTMLInputElement>(null);
	const [bookSearch, setBookSearch] = useState("");
	const [chapterSearch, setChapterSearch] = useState("");
	const [verseSearch, setVerseSearch] = useState("");
	const { t } = useTranslation(language);
	const isRTL = language === "he";
	const isScripture = activeDestination === "verse";
	const scriptureNavigationOpen = isScripture && !scriptureNavigationCollapsed;
	const Chevron = isRTL ? ChevronLeft : ChevronRight;
	const env =
		(
			import.meta as ImportMeta & {
				env?: { PUBLIC_NODE_ENV?: string };
			}
		).env ?? {};
	const publicNodeEnv = env.PUBLIC_NODE_ENV ?? "production";
	const isDev = publicNodeEnv === "development";

	useEffect(() => {
		const handleClickOutside = (event: PointerEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setOpenMenu(null);
			}
		};

		if (openMenu) {
			document.addEventListener("pointerdown", handleClickOutside);
			return () =>
				document.removeEventListener("pointerdown", handleClickOutside);
		}
	}, [openMenu, setOpenMenu]);

	useEffect(() => {
		if (!isScripture) {
			setSelectionMenu(null);
			setScriptureNavigationCollapsed(false);
		}
	}, [isScripture]);

	useEffect(() => {
		if (!openMenu) return;

		const previousOverflow = document.body.style.overflow;
		const previousOverscrollBehavior = document.body.style.overscrollBehavior;

		document.body.style.overflow = "hidden";
		document.body.style.overscrollBehavior = "none";

		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.style.overscrollBehavior = previousOverscrollBehavior;
		};
	}, [openMenu]);

	useEffect(() => {
		if (!openMenu) return;

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpenMenu(null);
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [openMenu, setOpenMenu]);

	useEffect(() => {
		if (!openMenu) return;
		if (openMenu === "book") {
			setBookSearch("");
			window.setTimeout(() => bookSearchRef.current?.focus(), 0);
		}
		if (openMenu === "chapter") {
			setChapterSearch("");
			window.setTimeout(() => chapterSearchRef.current?.focus(), 0);
		}
		if (openMenu === "verse") {
			setVerseSearch("");
			window.setTimeout(() => verseSearchRef.current?.focus(), 0);
		}
	}, [openMenu]);

	const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);
	const verses = Array.from({ length: verseCount }, (_, i) => i + 1);

	const normalizedBookSearch = bookSearch.trim().toLowerCase();
	const filteredBooks = normalizedBookSearch
		? books.filter((item) => {
				const haystack = [item.name, item.spanish, item.hebrew, item.greek]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(normalizedBookSearch);
			})
		: books;

	useEffect(() => {
		if (openMenu !== "book") return;

		const rafId = window.requestAnimationFrame(() => {
			const selectedBookButton =
				bookListRef.current?.querySelector<HTMLButtonElement>(
					'[data-current-book="true"]',
				);
			selectedBookButton?.scrollIntoView({
				block: "center",
				inline: "nearest",
			});
		});

		return () => window.cancelAnimationFrame(rafId);
	}, [openMenu]);

	const normalizedChapterSearch = chapterSearch.trim();
	const filteredChapters = normalizedChapterSearch
		? chapters.filter((item) =>
				String(item).startsWith(normalizedChapterSearch),
			)
		: chapters;

	const normalizedVerseSearch = verseSearch.trim();
	const filteredVerses = normalizedVerseSearch
		? verses.filter((item) => String(item).startsWith(normalizedVerseSearch))
		: verses;
	const seferEnabled = canUseSeferStyle({
		showFullChapter,
		hebrewOnly,
		translationOnly,
	});

	useEffect(() => {
		if (seferMode && openMenu === "verse") {
			setOpenMenu(null);
		}
	}, [seferMode, openMenu, setOpenMenu]);

	const settingsRowClass =
		"flex min-h-[50px] items-center justify-between gap-3 py-2.5";
	const toggleRow = (
		label: string,
		value: boolean,
		onChange: (value: boolean) => void,
		disabled = false,
		disabledReason?: string,
	) => (
		<div className={settingsRowClass}>
			<span className={`flex-1 text-[15px] ${disabled ? "opacity-55" : ""}`}>
				{label}
			</span>
			<PillToggle
				label={label}
				value={value}
				onChange={onChange}
				disabled={disabled}
				disabledReason={disabledReason}
			/>
		</div>
	);
	const selectRow = <T extends string>(
		label: string,
		value: T,
		onChange: (value: T) => void,
		options: { value: T; label: string }[],
	) => (
		<div className={settingsRowClass}>
			<span className="flex-1 text-[15px]">{label}</span>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value as T)}
				className="min-h-[30px] max-w-[50%] cursor-pointer border-0 bg-transparent text-[13px] text-[var(--text-secondary)] focus-visible:outline-[var(--primary)]"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);

	const renderSharedSetting = (id: SharedSettingId): ReactNode => {
		switch (id) {
			case "theme":
				return toggleRow(t("settings.theme.title"), theme === "dark", (dark) =>
					onThemeChange(dark ? "dark" : "light"),
				);
			case "language":
				return selectRow(
					t("settings.language.title"),
					language,
					onLanguageChange,
					[
						{ value: "en", label: t("languages.en") },
						{ value: "es", label: t("languages.es") },
						{ value: "he", label: t("languages.he") },
					],
				);
			case "besorahLanguage":
				if (!greekAvailable) return null;
				return selectRow(
					t("settings.besorahLanguage.title"),
					besorahLanguage,
					onBesorahLanguageChange,
					[
						{ value: "hebrew", label: t("settings.besorahLanguage.hebrew") },
						{ value: "greek", label: t("settings.besorahLanguage.greek") },
					],
				);
			case "besorahTextVersion":
				if (besorahLanguage === "greek") return null;
				return selectRow(
					t("settings.besorahTextVersion.title"),
					besorahTextVersion,
					onBesorahTextVersionChange,
					[
						{
							value: "delitzsch",
							label: t("settings.besorahTextVersion.delitzsch"),
						},
						{ value: "hutter", label: t("settings.besorahTextVersion.hutter") },
					],
				);
			case "calendarDayPill":
				return (
					<div>
						<div className={settingsRowClass}>
							<span className="flex-1 text-[15px]">
								{t("settings.calendarDayPill.title")}
							</span>
							<PillToggle
								label={t("settings.calendarDayPill.title")}
								value={showCalendarDayPill}
								onChange={(value) => onCalendarDayPillChange?.(value)}
								disabled={!onCalendarDayPillChange}
							/>
						</div>
						<CalendarCityNotice
							enabled={showCalendarDayPill}
							language={language}
							onChooseCity={() => {
								setOpenMenu(null);
								onDestinationClick("widgets");
							}}
						/>
					</div>
				);
			case "fullChapter":
				return (
					<>
						{toggleRow(
							t("settings.fullChapter.title"),
							showFullChapter,
							onFullChapterChange,
						)}
						{toggleRow(
							t("settings.translationOnly.title"),
							translationOnly,
							onTranslationOnlyChange,
						)}
					</>
				);
			case "seferStyle":
				if (!isSeferStyleVisible(showFullChapter)) return null;
				return toggleRow(
					t("settings.seferStyle.title"),
					seferMode,
					onSeferModeChange,
					!seferEnabled,
					t("settings.seferStyle.warningMessage"),
				);
			case "hebrewOnly":
				return toggleRow(
					t("settings.hebrewOnly.title"),
					hebrewOnly,
					onHebrewOnlyChange,
					translationOnly,
					t("settings.translationOnly.disablesHebrewFeatures"),
				);
			case "qumran":
				return toggleRow(
					t("settings.qumran.title"),
					showQumran,
					onQumranChange,
					translationOnly,
					t("settings.translationOnly.disablesHebrewFeatures"),
				);
			default: {
				const exhaustive: never = id;
				return exhaustive;
			}
		}
	};

	return (
		<div
			className="app-navigation relative w-full max-w-[620px]"
			ref={dropdownRef}
			dir={isRTL ? "rtl" : "ltr"}
		>
			<div className="main-navigation navigation-surface relative z-10 border border-[var(--neomorph-border)]">
				<nav
					aria-label="Davar"
					className="flex justify-center flex-wrap items-center gap-2 px-2 py-2 sm:gap-4 sm:px-[14px]"
				>
					<span className="text-xl" style={{ fontFamily: "Suez One" }}>
						דבר
					</span>
					<div className="flex w-full justify-center gap-0.5 p-1 rounded-full bg-[var(--navigation-bg)] sm:w-auto sm:gap-1">
						{(
							[
								"assemblies",
								"commentary",
								"verse",
								"widgets",
								"settings",
							] as const
						)
							.filter(
								(id) => id !== "assemblies" || capabilities.flags.assemblies,
							)
							.map((id) => (
								<button
									key={id}
									type="button"
									onClick={() => {
										if (id === "settings") {
											setOpenMenu(openMenu === "settings" ? null : "settings");
										} else {
											setOpenMenu(null);
											if (id === "verse") {
												setScriptureNavigationCollapsed((collapsed) =>
													isScripture ? !collapsed : false,
												);
											}
											onDestinationClick(id);
										}
									}}
									aria-current={
										id !== "settings" && activeDestination === id
											? "page"
											: undefined
									}
									aria-expanded={
										id === "settings"
											? settingsOpen
											: id === "verse"
												? scriptureNavigationOpen
												: undefined
									}
									aria-controls={
										id === "settings"
											? "navigation-settings"
											: id === "verse"
												? "scripture-navigation"
												: undefined
									}
									className={`flex-1 px-1 py-2 rounded-full text-[10px] sm:flex-none sm:px-[14px] sm:text-[13px] text-[var(--text-primary)] ${(id === "settings" ? settingsOpen : activeDestination === id) ? "bg-[var(--accent-glow)]" : ""}`}
								>
									{id === "verse"
										? "Scripture"
										: id === "widgets"
											? t("calendar.nav")
											: id === "settings"
												? t("settings.title")
												: id[0].toUpperCase() + id.slice(1)}
								</button>
							))}
					</div>
				</nav>
			</div>
			<div
				id="scripture-navigation"
				className="scripture-navigation navigation-surface"
				data-open={scriptureNavigationOpen}
				aria-hidden={!scriptureNavigationOpen}
				inert={!scriptureNavigationOpen}
			>
				<div className="min-h-0 overflow-hidden">
					<nav
						aria-label={`${t("navigation.selectBook")}, ${t("navigation.selectChapter")}, ${t("navigation.selectVerse")}`}
						className="scripture-navigation-content w-fit max-w-full rounded-b-2xl border border-t-0 border-[var(--neomorph-border)] px-2 py-1.5 sm:px-3"
					>
						<div className="flex min-w-0 items-center gap-0.5 rounded-full bg-[var(--navigation-bg)] p-0.5 sm:gap-1">
							<button
								type="button"
								onClick={() => setOpenMenu(openMenu === "book" ? null : "book")}
								className={`flex min-w-0 items-center gap-1 rounded-full px-2 py-1.5 text-[10px] text-[var(--text-primary)] sm:gap-2 sm:px-3 sm:text-[11px] ${openMenu === "book" ? "bg-[var(--accent-glow)]" : ""}`}
								aria-label={t("navigation.selectBook")}
								aria-expanded={openMenu === "book"}
							>
								<BookOpen className="hidden md:block w-3 h-3 text-[var(--text-primary)]" />
								<span className="min-w-0 truncate">
									<span className="md:hidden">{bookDisplayName}</span>
									<span className="hidden md:inline">{bookDisplayName} | </span>
									<span
										className="hidden md:inline"
										style={{
											fontFamily:
												besorahLanguage === "greek" &&
												books.find((item) => item.name === book)?.greek
													? "'Cardo', serif"
													: "'Suez One', serif",
										}}
									>
										{bookHebrew}
									</span>
								</span>
							</button>

							<span aria-hidden="true" className="text-[var(--text-secondary)]">
								|
							</span>
							<button
								type="button"
								onClick={() =>
									setOpenMenu(openMenu === "chapter" ? null : "chapter")
								}
								className={`shrink-0 rounded-full px-2 py-1.5 text-[10px] text-[var(--text-primary)] sm:px-3 sm:text-[11px] ${openMenu === "chapter" ? "bg-[var(--accent-glow)]" : ""}`}
								aria-label={t("navigation.selectChapter")}
								aria-expanded={openMenu === "chapter"}
							>
								<span>{chapter}</span>
							</button>

							{!seferMode && (
								<>
									<span
										aria-hidden="true"
										className="text-[var(--text-secondary)]"
									>
										|
									</span>
									<button
										type="button"
										onClick={() =>
											setOpenMenu(openMenu === "verse" ? null : "verse")
										}
										className={`shrink-0 rounded-full px-2 py-1.5 text-[10px] text-[var(--text-primary)] sm:px-3 sm:text-[11px] ${openMenu === "verse" ? "bg-[var(--accent-glow)]" : ""}`}
										aria-label={t("navigation.selectVerse")}
										aria-expanded={openMenu === "verse"}
									>
										<span>{verse}</span>
									</button>
								</>
							)}
						</div>
					</nav>
				</div>
			</div>

			{openMenu === "settings" && (
				<section
					id="navigation-settings"
					aria-label={t("settings.title")}
					className="absolute end-0 top-full mt-3 w-[360px] max-w-[calc(100vw-32px)] max-h-[calc(100dvh-180px)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] backdrop-blur-[16px] shadow-[0_8px_32px_0_var(--glass-shadow)] p-5 z-30"
					onWheelCapture={(event) => {
						event.stopPropagation();
					}}
					onTouchMoveCapture={(event) => {
						event.stopPropagation();
					}}
				>
					<div
						className="space-y-1 text-[var(--text-primary)]"
						style={{ fontFamily: "Inter, sans-serif" }}
					>
						<button
							type="button"
							className={`${settingsRowClass} w-full text-start text-[15px]`}
							onClick={() => {
								setOpenMenu(null);
								onDestinationClick("account");
							}}
						>
							<span className="flex items-center gap-3">
								{t("settings.account.title")}
							</span>
							<span className="flex items-center gap-1 text-[13px] text-[var(--accent-deep)]">
								{t(
									productApi.authenticated()
										? "settings.account.manage"
										: "settings.account.signIn",
								)}
								<Chevron size={16} />
							</span>
						</button>
						{SHARED_SETTINGS_ORDER.map((id) => (
							<Fragment key={id}>{renderSharedSetting(id)}</Fragment>
						))}
						{toggleRow(
							t("settings.nikud.title"),
							showNikud,
							onNikudChange,
							translationOnly,
							t("settings.translationOnly.disablesHebrewFeatures"),
						)}
						{toggleRow(
							t("settings.cantillation.title"),
							showCantillation,
							onCantillationChange,
							translationOnly,
							t("settings.translationOnly.disablesHebrewFeatures"),
						)}
					</div>
					{isDev &&
						[
							["settings.designSystemTitle", onDesignSystemClick],
							["settings.mobileDesignGuideTitle", onMobileDesignGuideClick],
						].map(([label, action]) =>
							typeof action === "function" ? (
								<button
									key={String(label)}
									type="button"
									className="mt-5 flex w-full items-center justify-between text-sm text-[var(--text-primary)]"
									onClick={() => {
										setOpenMenu(null);
										action();
									}}
								>
									<span className="flex items-center gap-3">
										<Paintbrush className="size-4 text-[var(--text-secondary)]" />
										{t(String(label))}
									</span>
									<Chevron size={16} />
								</button>
							) : null,
						)}
					<SettingsResources
						language={language}
						onOpenScreen={(screen) => {
							setOpenMenu(null);
							onDestinationClick(screen);
						}}
					/>
				</section>
			)}

			{openMenu === "book" && (
				<div
					className={`absolute ${isRTL ? "right-0" : "left-0"} mt-4 w-[280px] rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] backdrop-blur-[16px] shadow-[0_8px_32px_0_var(--glass-shadow)] p-4 z-30`}
					onWheelCapture={(event) => {
						event.stopPropagation();
					}}
					onTouchMoveCapture={(event) => {
						event.stopPropagation();
					}}
				>
					<div className="mb-3">
						<input
							ref={bookSearchRef}
							value={bookSearch}
							onChange={(event) => setBookSearch(event.target.value)}
							placeholder="Search book"
							className="w-full rounded-full px-4 py-2 text-base md:text-xs text-[var(--text-primary)]"
							style={{
								fontFamily: "'Inter', sans-serif",
								backgroundColor: "var(--neomorph-bg)",
								border: "1px solid var(--neomorph-border)",
								boxShadow:
									"inset 3px 3px 6px var(--neomorph-inset-shadow-dark), inset -3px -3px 6px var(--neomorph-inset-shadow-light)",
							}}
						/>
					</div>
					<div
						ref={bookListRef}
						className="max-h-[320px] overflow-y-auto overscroll-contain space-y-2"
					>
						{filteredBooks.map((item) => (
							<button
								type="button"
								key={item.name}
								data-current-book={item.name === book ? "true" : undefined}
								onClick={() => {
									onBookChange(item.name);
									setOpenMenu(null);
								}}
								className={`w-full flex items-center justify-between rounded-xl px-4 py-3 transition-all ${
									item.name === book
										? "bg-[var(--accent-strong)] text-white"
										: "bg-[var(--muted)] text-[var(--text-primary)]"
								}`}
								style={{ fontFamily: "'Inter', sans-serif" }}
							>
								<span className="text-xs tracking-[0.2em] uppercase">
									{language === "es"
										? formatBookDisplayName(item.spanish)
										: formatBookDisplayName(item.name)}
								</span>
								<span
									className="text-sm"
									style={{
										fontFamily:
											besorahLanguage === "greek" && item.greek
												? "'Cardo', serif"
												: "'Suez One', serif",
									}}
								>
									{besorahLanguage === "greek" && item.greek
										? item.greek
										: item.hebrew}
								</span>
							</button>
						))}
					</div>
				</div>
			)}

			{openMenu === "chapter" && (
				<div
					className={`absolute ${isRTL ? "right-0" : "left-0"} mt-4 w-[280px] rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] backdrop-blur-[16px] shadow-[0_8px_32px_0_var(--glass-shadow)] p-4 z-30`}
					onWheelCapture={(event) => {
						event.stopPropagation();
					}}
					onTouchMoveCapture={(event) => {
						event.stopPropagation();
					}}
				>
					<div className="mb-3">
						<input
							ref={chapterSearchRef}
							value={chapterSearch}
							onChange={(event) =>
								setChapterSearch(event.target.value.replace(/[^0-9]/g, ""))
							}
							placeholder={t("navigation.chapterShort")}
							inputMode="numeric"
							className="w-full rounded-full px-4 py-2 text-base md:text-xs text-[var(--text-primary)]"
							style={{
								fontFamily: "'Inter', sans-serif",
								backgroundColor: "var(--neomorph-bg)",
								border: "1px solid var(--neomorph-border)",
								boxShadow:
									"inset 3px 3px 6px var(--neomorph-inset-shadow-dark), inset -3px -3px 6px var(--neomorph-inset-shadow-light)",
							}}
						/>
					</div>
					<div className="grid grid-cols-5 gap-2 max-h-[320px] overflow-y-auto overscroll-contain">
						{filteredChapters.map((item) => (
							<button
								type="button"
								key={item}
								onClick={() => {
									onChapterChange(item);
									setOpenMenu(null);
								}}
								className={`rounded-xl px-2 py-2 text-xs transition-all ${
									item === chapter
										? "bg-[var(--accent-strong)] text-white"
										: "bg-[var(--muted)] text-[var(--text-primary)]"
								}`}
								style={{ fontFamily: "'Inter', sans-serif" }}
							>
								{item}
							</button>
						))}
					</div>
				</div>
			)}

			{openMenu === "verse" && (
				<div
					className={`absolute ${isRTL ? "right-0" : "left-0"} mt-4 w-[280px] rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] backdrop-blur-[16px] shadow-[0_8px_32px_0_var(--glass-shadow)] p-4 z-30`}
					onWheelCapture={(event) => {
						event.stopPropagation();
					}}
					onTouchMoveCapture={(event) => {
						event.stopPropagation();
					}}
				>
					<div className="mb-3">
						<input
							ref={verseSearchRef}
							value={verseSearch}
							onChange={(event) =>
								setVerseSearch(event.target.value.replace(/[^0-9]/g, ""))
							}
							placeholder={t("navigation.verseShort")}
							inputMode="numeric"
							className="w-full rounded-full px-4 py-2 text-base md:text-xs text-[var(--text-primary)]"
							style={{
								fontFamily: "'Inter', sans-serif",
								backgroundColor: "var(--neomorph-bg)",
								border: "1px solid var(--neomorph-border)",
								boxShadow:
									"inset 3px 3px 6px var(--neomorph-inset-shadow-dark), inset -3px -3px 6px var(--neomorph-inset-shadow-light)",
							}}
						/>
					</div>
					<div className="grid grid-cols-5 gap-2 max-h-[320px] overflow-y-auto overscroll-contain">
						{filteredVerses.map((item) => (
							<button
								type="button"
								key={item}
								onClick={() => {
									onVerseChange(item);
									setOpenMenu(null);
								}}
								className={`rounded-xl px-2 py-2 text-xs transition-all ${
									item === verse
										? "bg-[var(--accent-strong)] text-white"
										: "bg-[var(--muted)] text-[var(--text-primary)]"
								}`}
								style={{ fontFamily: "'Inter', sans-serif" }}
							>
								{item}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
