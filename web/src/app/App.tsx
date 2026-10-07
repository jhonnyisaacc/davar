import { parseSourceStrong } from "@davar/shared/greekBesorah";
import { BottomSheet } from "./components/BottomSheet";
import { DesignSystemExport } from "./components/DesignSystemExport";
import { MobileDesignSystemGuide } from "./components/MobileDesignSystemGuide";
import { NavigationBar } from "./components/NavigationBar";
import { NeumorphCard } from "./components/NeumorphCard";
import { SandboxBanner } from "./components/SandboxBanner";
import { Skeleton } from "./components/ui/skeleton";
import { VerseDisplay } from "./components/VerseDisplay";
import { WordCard } from "./components/WordCard";
import { useReaderChrome } from "./features/reader/useReaderChrome";
import { useReaderPreferences } from "./features/reader/useReaderPreferences";
import { useReaderRoute } from "./features/reader/useReaderRoute";
import { useReadingModes } from "./features/reader/useReadingModes";
import { useReadingPosition } from "./features/reader/useReadingPosition";
import { useScreenNavigation } from "./features/reader/useScreenNavigation";
import { useVerseLibrary } from "./features/reader/useVerseLibrary";
import { useWordSelection } from "./features/reader/useWordSelection";
import { useCalendarLifecycle } from "./hooks/useCalendar";
import { renderNonVerseScreen } from "./nonVerseScreens";
import { prefetchLexiconEntry } from "./services/staticData";
import {
	createDefaultReadingState,
	getLastPositionForBook,
	getStoredReadingState,
} from "./utils/storageHelpers";
import { getDssCommentaryForLanguage } from "./utils/translationConfig";

export default function App() {
	useCalendarLifecycle();
	const initialState = getStoredReadingState() ?? createDefaultReadingState();
	const {
		currentScreen,
		setCurrentScreen,
		settingsOpen,
		setSettingsOpen,
		handleOpenScreen,
	} = useScreenNavigation();
	const {
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
	} = useReaderPreferences(initialState);
	const {
		currentBook,
		setCurrentBook,
		currentChapter,
		setCurrentChapter,
		currentVerse,
		setCurrentVerse,
	} = useReadingPosition(initialState);
	const {
		books,
		chapterVerses,
		setChapterVerses,
		chapterCount,
		verseCount,
		isLoading,
		currentVerseData,
		currentVerseIndex,
		bookOptions,
		isBesorah,
		getHebrewBookName,
		getDisplayBookName,
		handlePreviousVerse,
		handleNextVerse,
	} = useVerseLibrary({
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
	});
	const {
		handleSeferModeChange,
		handleHebrewOnlyChange,
		handleTranslationOnlyChange,
	} = useReadingModes({
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
	});
	useReaderRoute({
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
	});
	const {
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
	} = useWordSelection({
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
	});
	const {
		hideNavOnScroll,
		versePanelRef,
		isScrollNavigationActive,
		showDesignSystem,
		setShowDesignSystem,
		showMobileDesignGuide,
		setShowMobileDesignGuide,
	} = useReaderChrome({
		isMobile,
		currentScreen,
		showFullChapter,
		seferMode,
		settingsOpen,
		isWordPanelHovered,
		handleNextVerse,
		handlePreviousVerse,
		triggerScrollJump,
	});

	return (
		<div
			className="min-h-screen"
			style={{
				backgroundColor: "var(--background)",
				minHeight: isMobile ? "100dvh" : undefined,
				height: isScrollNavigationActive ? "100vh" : undefined,
				overflow: isScrollNavigationActive ? "hidden" : undefined,
			}}
		>
			<div
				className={`sticky top-0 z-40 px-2 pt-4 pb-4 sm:px-4 sm:pt-5 sm:pb-5 md:px-6 md:pt-6 md:pb-6 transition-transform duration-300 ${
					hideNavOnScroll
						? "-translate-y-full opacity-0 pointer-events-none"
						: "translate-y-0 opacity-100"
				}`}
			>
				<SandboxBanner />
				<div className="mx-auto flex justify-center">
					<NavigationBar
						activeDestination={currentScreen}
						onDestinationClick={handleOpenScreen}
						settingsOpen={settingsOpen}
						onSettingsOpenChange={setSettingsOpen}
						book={currentBook}
						bookDisplayName={getDisplayBookName(currentBook)}
						bookHebrew={getHebrewBookName(currentBook)}
						chapter={currentChapter}
						verse={currentVerse}
						books={bookOptions}
						chapterCount={chapterCount}
						verseCount={verseCount}
						onBookChange={(selectedBook) => {
							if (selectedBook === currentBook) {
								const stored = getStoredReadingState();
								if (stored) {
									const position = getLastPositionForBook(stored, selectedBook);
									setCurrentChapter(position.chapter);
									setCurrentVerse(position.verse);
								}
							} else {
								setCurrentBook(selectedBook);
								setCurrentChapter(1);
								setCurrentVerse(1);
							}
							setCurrentScreen("verse");
						}}
						onChapterChange={(chapter) => {
							setCurrentChapter(chapter);
							setCurrentVerse(1);
						}}
						onVerseChange={(verse) => setCurrentVerse(verse)}
						onDesignSystemClick={() => setShowDesignSystem(true)}
						onMobileDesignGuideClick={() => setShowMobileDesignGuide(true)}
						theme={theme}
						onThemeChange={setTheme}
						language={language}
						onLanguageChange={setLanguage}
						besorahLanguage={besorahLanguage}
						onBesorahLanguageChange={setBesorahLanguage}
						greekAvailable={greekAvailable}
						besorahTextVersion={besorahTextVersion}
						onBesorahTextVersionChange={handleBesorahTextVersionChange}
						showQumran={showQumran}
						onQumranChange={setShowQumran}
						showFullChapter={showFullChapter}
						onFullChapterChange={setShowFullChapter}
						showCalendarDayPill={showCalendarDayPill}
						onCalendarDayPillChange={setShowCalendarDayPill}
						seferMode={seferMode}
						onSeferModeChange={handleSeferModeChange}
						hebrewOnly={hebrewOnly}
						onHebrewOnlyChange={handleHebrewOnlyChange}
						showNikud={showNikud}
						onNikudChange={setShowNikud}
						showCantillation={showCantillation}
						onCantillationChange={setShowCantillation}
						translationOnly={translationOnly}
						onTranslationOnlyChange={handleTranslationOnlyChange}
					/>
				</div>
			</div>

			<div className="px-6 pb-10 md:pb-32 pt-6">
				<div className="max-w-7xl mx-auto">
					{currentScreen !== "verse" &&
						renderNonVerseScreen({
							screen: currentScreen,
							language,
							theme,
							onThemeChange: setTheme,
							onLanguageChange: setLanguage,
							besorahLanguage,
							onBesorahLanguageChange: setBesorahLanguage,
							greekAvailable,
							besorahTextVersion,
							onBesorahTextVersionChange: handleBesorahTextVersionChange,
							showQumran,
							onQumranChange: setShowQumran,
							showFullChapter,
							onFullChapterChange: setShowFullChapter,
							showCalendarDayPill,
							onCalendarDayPillChange: setShowCalendarDayPill,
							seferMode,
							onSeferModeChange: handleSeferModeChange,
							hebrewOnly,
							onHebrewOnlyChange: handleHebrewOnlyChange,
							translationOnly,
							onTranslationOnlyChange: handleTranslationOnlyChange,
							onOpenScreen: handleOpenScreen,
							onOpenDesignSystem: () => setShowDesignSystem(true),
							onOpenMobileDesignGuide: () => setShowMobileDesignGuide(true),
						})}

					{currentScreen === "verse" && (
						<div className="grid gap-6 items-start md:grid-cols-[7fr_3fr]">
							<div
								ref={versePanelRef}
								className={`min-h-[70vh] ${
									showFullChapter
										? isMobile
											? "pt-8"
											: ""
										: isMobile
											? "flex items-start pt-8"
											: "flex items-center justify-center"
								} w-full max-w-3xl md:max-w-4xl justify-self-center verse-panel-shell ${
									isSplitView
										? "verse-panel-split md:col-span-1"
										: "verse-panel-centered md:col-span-2"
								} ${scrollJumpActive ? "verse-panel-jump" : ""}`}
								style={
									showFullChapter
										? undefined
										: isMobile
											? undefined
											: { height: "70vh" }
								}
							>
								<div className="verse-panel-inner relative">
									{currentVerseData ? (
										<VerseDisplay
											hebrewText={
												currentVerseData.source_language === "greek"
													? (currentVerseData.text ?? "")
													: currentVerseData.hebrew
											}
											sourceLanguage={
												currentVerseData.source_language ?? "hebrew"
											}
											sourceAvailable={currentVerseData.available !== false}
											translation={currentVerseData.translation ?? ""}
											verseRef={`${currentBook} ${currentChapter}:${currentVerse}`}
											verseNumber={currentVerseData.verse}
											bookName={getDisplayBookName(currentBook)}
											bookNameHebrew={getHebrewBookName(currentBook)}
											book={currentBook}
											chapter={currentChapter}
											language={language}
											onWordClick={handleWordClick}
											onWordHover={(word) => {
												prefetchLexiconEntry(parseSourceStrong(word.strong));
											}}
											showOnboardingHint={showWordHint}
											showQumran={
												showQumran &&
												currentVerseData.source_language !== "greek"
											}
											showFullChapter={showFullChapter}
											showCalendarDayPill={showCalendarDayPill}
											onOpenCalendar={() => setCurrentScreen("widgets")}
											seferMode={seferMode}
											hebrewOnly={hebrewOnly}
											showNikud={showNikud}
											showCantillation={showCantillation}
											translationOnly={translationOnly}
											chapterVerses={chapterVerses}
											words={currentVerseData.words}
											dssVariants={currentVerseData.dss}
											selectedWord={highlightedWord ?? null}
											selectedWordContext={highlightedWordContext}
											isBesorah={isBesorah}
											translation_footnotes={
												currentVerseData.translation_footnotes
											}
											previousVerseSnippet={
												currentVerseIndex > 0
													? t("verse.previousSnippet")
													: undefined
											}
											nextVerseSnippet={
												currentVerseIndex >= 0 &&
												currentVerseIndex < chapterVerses.length - 1
													? t("verse.nextSnippet")
													: undefined
											}
											onSwipeUp={() => {
												void handlePreviousVerse();
											}}
											onSwipeDown={() => {
												void handleNextVerse();
											}}
											canNavigatePrevious={
												currentVerseIndex > 0 || currentChapter > 1
											}
											canNavigateNext={
												(currentVerseIndex >= 0 &&
													currentVerseIndex < chapterVerses.length - 1) ||
												currentChapter < chapterCount
											}
										/>
									) : (
										<NeumorphCard>
											{isLoading ? (
												<div className="mx-auto w-fit space-y-3">
													<Skeleton className="h-3 w-56" />
													<Skeleton className="h-3 w-56" />
													<Skeleton className="h-3 w-56" />
													<Skeleton className="h-3 w-56" />
												</div>
											) : (
												<p className="text-sm text-gray-500">
													{t("verse.selectBookPrompt")}
												</p>
											)}
										</NeumorphCard>
									)}
								</div>
							</div>

							{(!showFullChapter || isWordPanelActive) && (
								<div
									className={`hidden md:block ${showFullChapter ? "word-panel-fixed-wrapper" : ""}`}
									style={showFullChapter ? undefined : { height: "70vh" }}
								>
									{(() => {
										const wordForCard =
											selectedWord ??
											(!isNavigatingWordPanel && !showWordSkeleton
												? lastSelectedWord
												: null);
										const wordContextForCard =
											selectedWord && selectedWordContext
												? selectedWordContext
												: !selectedWord && lastSelectedWordContext
													? lastSelectedWordContext
													: null;
										const wordAnalysisForCard = selectedWord
											? selectedWordAnalysis
											: lastSelectedWordAnalysis;
										const dssAnalysisForCard = selectedWord
											? selectedDssAnalysis
											: lastSelectedDssAnalysis;
										const verseDataForWordCard = wordContextForCard
											? (chapterVerses.find(
													(item) =>
														item.chapter === wordContextForCard.chapter &&
														item.verse === wordContextForCard.verse,
												) ?? currentVerseData)
											: currentVerseData;
										const dssVariantForCard =
											verseDataForWordCard?.dss?.find(
												(variant) => variant.position === wordForCard?.position,
											) ?? null;
										const qumranWordForCard = resolveRenderableDssWord(
											dssVariantForCard?.dss_word,
										);
										const wordMeanings =
											wordAnalysisForCard?.definitions?.map(
												(item) => item.text,
											) ?? [];
										const wordTransliteration =
											getTransliterationForLanguage(wordForCard) ??
											getAnalysisTransliterationForLanguage(
												wordAnalysisForCard,
											);
										const qumranTransliterationFromWord = wordForCard
											? language === "en"
												? wordForCard.dss_translit_en
												: language === "es"
													? wordForCard.dss_translit_es
													: undefined
											: undefined;
										const qumranTransliteration =
											qumranTransliterationFromWord ??
											(dssAnalysisForCard
												? language === "en"
													? dssAnalysisForCard.translit_en
													: language === "es"
														? dssAnalysisForCard.translit_es
														: undefined
												: undefined);
										const dssCommentary = getDssCommentaryForLanguage(
											language,
											dssVariantForCard,
										);
										const dssMeanings =
											dssAnalysisForCard?.definitions?.map(
												(item) => item.text,
											) ?? [];
										const hasQumranVariant = Boolean(qumranWordForCard);

										return (
											<NeumorphCard
												className={`p-6 ${
													isWordPanelActive
														? "word-panel-open"
														: "word-panel-closed"
												} ${showFullChapter ? "" : "sticky top-24"} word-panel-shell ${
													hasQumranVariant ? "word-card-qumran" : ""
												}`}
												onMouseEnter={() => setIsWordPanelHovered(true)}
												onMouseLeave={() => setIsWordPanelHovered(false)}
											>
												{shouldShowWordSkeleton ? (
													<div className="space-y-5">
														<div className="flex justify-end">
															<Skeleton className="h-9 w-9 rounded-full" />
														</div>
														<Skeleton className="h-16 w-40 mx-auto" />
														<Skeleton className="h-3 w-32 mx-auto" />
														<Skeleton className="h-4 w-full" />
														<Skeleton className="h-4 w-4/5" />
														<Skeleton className="h-4 w-3/4" />
													</div>
												) : wordForCard && isWordPanelVisible ? (
													<WordCard
														key={`${parseSourceStrong(wordForCard.strong) ?? wordForCard.text}-${wordForCard.position}-${wordContextForCard?.chapter ?? ""}-${wordContextForCard?.verse ?? ""}`}
														word={wordForCard.text}
														sourceLanguage={
															wordForCard.source_language ?? "hebrew"
														}
														wordFromVerse={wordForCard.text}
														strongNumber={
															parseSourceStrong(wordForCard.strong) ??
															wordAnalysisForCard?.strong_number
														}
														qumranWord={qumranWordForCard}
														qumranStrong={dssVariantForCard?.dss_strong}
														qumranTransliteration={qumranTransliteration}
														qumranMeanings={dssMeanings}
														qumranCommentary={dssCommentary}
														qumranRoot={dssAnalysisForCard?.root}
														qumranRootTransliteration={
															language === "en"
																? dssAnalysisForCard?.root_translit_en
																: dssAnalysisForCard?.root_translit_es
														}
														qumranRootMeaning={
															dssAnalysisForCard?.root_definitions
																?.map((item) => item.text)
																.filter(Boolean)
																.join(", ") || undefined
														}
														qumranRootStrongNumber={
															dssAnalysisForCard?.root_strong
														}
														hasQumranVariant={hasQumranVariant}
														showQumran={showQumran}
														transliteration={wordTransliteration}
														meanings={wordMeanings}
														root={wordAnalysisForCard?.root}
														rootTransliteration={
															language === "en"
																? wordAnalysisForCard?.root_translit_en
																: wordAnalysisForCard?.root_translit_es
														}
														rootMeaning={
															wordAnalysisForCard?.root_definitions
																?.map((item) => item.text)
																.filter(Boolean)
																.join(", ") || undefined
														}
														rootStrongNumber={wordAnalysisForCard?.root_strong}
														prefixes={wordForCard.prefixes}
														language={language}
														showNikud={showNikud}
														instances={(
															wordAnalysisForCard?.instances ?? []
														).map((instance) =>
															typeof instance === "string"
																? { verse: instance, text: "" }
																: instance,
														)}
														onInstanceClick={handleNavigateToVerse}
														tabResetKey={wordCardTabKey}
														onClose={() => {
															if (!isMobile) {
																setIsWordPanelDismissed(true);
															}
															setSelectedWord(null);
															setSelectedWordContext(null);
															setIsNavigatingWordPanel(false);
															setShowWordSkeleton(false);
															if (wordSkeletonTimerRef.current) {
																window.clearTimeout(
																	wordSkeletonTimerRef.current,
																);
																wordSkeletonTimerRef.current = null;
															}
														}}
														isLoading={Boolean(
															selectedWord && isWordAnalysisLoading,
														)}
														isQumranLoading={Boolean(
															selectedWord && isDssAnalysisLoading,
														)}
														isBesorah={isBesorah}
													/>
												) : isNavigatingWordPanel ? (
													<div className="h-40" />
												) : (
													<div
														className="text-sm text-[var(--text-secondary)]"
														style={{ fontFamily: "'Inter', sans-serif" }}
													>
														{t("wordCard.selectWord")}
													</div>
												)}
											</NeumorphCard>
										);
									})()}
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="md:hidden">
				<div className="h-10" />
			</div>

			{isScrollNavigationActive && desktopScrollHintCount < 5 && (
				<div className="scroll-nav-hint" aria-live="polite">
					<p>{t("verse.scrollNextHint")}</p>
					{currentVerse > 1 && <p>{t("verse.scrollPreviousHint")}</p>}
				</div>
			)}

			{isMobile && currentScreen === "verse" && (
				<BottomSheet
					isOpen={isWordSheetOpen}
					onClose={closeWordSheet}
					onAfterClose={handleWordSheetAfterClose}
					title=""
				>
					{(() => {
						if (!selectedWord) return null;

						const selectedWordVerseDataForSheet = selectedWordContext
							? (chapterVerses.find(
									(item) =>
										item.chapter === selectedWordContext.chapter &&
										item.verse === selectedWordContext.verse,
								) ?? currentVerseData)
							: currentVerseData;

						const dssVariantForCard =
							selectedWordVerseDataForSheet?.dss?.find(
								(variant) => variant.position === selectedWord.position,
							) ?? null;
						const qumranWordForCard = resolveRenderableDssWord(
							dssVariantForCard?.dss_word,
						);
						const dssCommentary = getDssCommentaryForLanguage(
							language,
							dssVariantForCard,
						);
						const dssMeanings =
							selectedDssAnalysis?.definitions?.map((item) => item.text) ?? [];
						const hasQumranVariant = Boolean(qumranWordForCard);
						const qumranTransliterationFromWord =
							language === "en"
								? selectedWord.dss_translit_en
								: language === "es"
									? selectedWord.dss_translit_es
									: undefined;
						const qumranTransliteration = selectedDssAnalysis
							? (qumranTransliterationFromWord ??
								(language === "en"
									? selectedDssAnalysis.translit_en
									: language === "es"
										? selectedDssAnalysis.translit_es
										: undefined))
							: qumranTransliterationFromWord;

						const selectedWordMeanings =
							selectedWordAnalysis?.definitions?.map((item) => item.text) ?? [];
						const selectedWordTransliteration =
							getTransliterationForLanguage(selectedWord) ??
							getAnalysisTransliterationForLanguage(selectedWordAnalysis);

						return (
							<WordCard
								key={`${parseSourceStrong(selectedWord.strong) ?? selectedWord.text}-${selectedWord.position}`}
								word={selectedWord.text}
								sourceLanguage={selectedWord.source_language ?? "hebrew"}
								wordFromVerse={selectedWord.text}
								strongNumber={
									parseSourceStrong(selectedWord.strong) ??
									selectedWordAnalysis?.strong_number
								}
								qumranWord={qumranWordForCard}
								qumranStrong={dssVariantForCard?.dss_strong}
								qumranTransliteration={qumranTransliteration}
								qumranMeanings={dssMeanings}
								qumranCommentary={dssCommentary}
								qumranRoot={selectedDssAnalysis?.root}
								qumranRootTransliteration={
									language === "en"
										? selectedDssAnalysis?.root_translit_en
										: selectedDssAnalysis?.root_translit_es
								}
								qumranRootMeaning={
									selectedDssAnalysis?.root_definitions
										?.map((item) => item.text)
										.filter(Boolean)
										.join(", ") || undefined
								}
								qumranRootStrongNumber={selectedDssAnalysis?.root_strong}
								hasQumranVariant={hasQumranVariant}
								showQumran={showQumran}
								transliteration={selectedWordTransliteration}
								meanings={selectedWordMeanings}
								root={selectedWordAnalysis?.root}
								rootTransliteration={
									language === "en"
										? selectedWordAnalysis?.root_translit_en
										: selectedWordAnalysis?.root_translit_es
								}
								rootMeaning={
									selectedWordAnalysis?.root_definitions
										?.map((item) => item.text)
										.filter(Boolean)
										.join(", ") || undefined
								}
								rootStrongNumber={selectedWordAnalysis?.root_strong}
								prefixes={selectedWord.prefixes}
								language={language}
								showNikud={showNikud}
								instances={(selectedWordAnalysis?.instances ?? []).map(
									(instance) =>
										typeof instance === "string"
											? { verse: instance, text: "" }
											: instance,
								)}
								onInstanceClick={handleNavigateToVerse}
								tabResetKey={wordCardTabKey}
								onClose={closeWordSheet}
								isLoading={Boolean(selectedWord && isWordAnalysisLoading)}
								isQumranLoading={Boolean(isDssAnalysisLoading)}
								isBesorah={isBesorah}
							/>
						);
					})()}
				</BottomSheet>
			)}

			{showDesignSystem && (
				<div className="fixed inset-0 z-50 overflow-auto">
					<DesignSystemExport
						theme={theme}
						onThemeChange={setTheme}
						onClose={() => setShowDesignSystem(false)}
					/>
				</div>
			)}

			{showMobileDesignGuide && (
				<div className="fixed inset-0 z-50 overflow-auto bg-[var(--background)]">
					<div className="min-h-screen p-8">
						<div className="max-w-7xl mx-auto">
							<button
								type="button"
								onClick={() => setShowMobileDesignGuide(false)}
								className="mb-8 px-6 py-3 bg-[var(--primary)] text-white rounded-full hover:scale-105 transition-all"
								style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
							>
								{t("navigation.backToApp")}
							</button>
							<MobileDesignSystemGuide />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
