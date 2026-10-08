import { FullChapterView } from "@/src/components/FullChapterView";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  Platform,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation } from "expo-router";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import type { BottomTabNavigationProp } from "expo-router/js-tabs";
import type { ParamListBase } from "expo-router/react-navigation";
import { VerseCard } from "@/src/components/VerseCard";
import { VerseCardSkeleton } from "@/src/components/VerseCardSkeleton";
import { getNavigationDockContentPadding } from "@/src/constants/navigationDock";
import { VERSE_SCROLL_EDGE_EPSILON as EDGE_EPSILON } from "@/src/services/versePaging";
import { ChapterFlow } from "@/src/features/reader/ChapterFlow";
import { VersePage } from "@/src/features/reader/VersePage";
import { WordAnalysisBottomSheet } from "@/src/features/reader/WordAnalysisBottomSheet";
import { createStyles } from "@/src/features/reader/verseDetailStyles";
import {
  NavigationSheet,
  type NavigationSheetMethods,
} from "@/src/components/NavigationSheet";
import { CalendarDayPill } from "@/src/features/calendar/CalendarDayPill";
import { useCalendar } from "@/src/features/calendar/useCalendar";
import { readingCalendarPill } from "@davar/shared/calendarPresentation";
import { BookChapterPill } from "@/src/components/ui/BookChapterPill";
import { getColors, getResponsiveLayout, spacing } from "@/src/theme";
import { fetchMetadata } from "@/src/services/metadata";
import type { BookResponse, TranslationFootnote } from "@/src/types/api";
import {
  fetchChapterVerses,
  fetchGreekChapterVerses,
  type DisplayVerse,
} from "@/src/services/scripture";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";
import {
  loadSwipeUpHintCount,
  saveSwipeUpHintCount,
} from "@/src/services/storage";
import { formatBookDisplayName } from "../utils/bookNameFormatter";
import { stripNikud } from "@/src/utils/hebrew";
import { resolveGreekOverlayLanguage } from "@/src/utils/translationConfig";

const SWIPE_HINT_MAX_SHOWS = 5;

type TabPressEvent = {
  preventDefault: () => void;
};

export const VerseDetailContent = () => {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const layout = useMemo(() => getResponsiveLayout(screenWidth, screenHeight), [screenWidth, screenHeight]);
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const pageHeight =
    measuredHeight > 0
      ? measuredHeight
      : Math.max(0, screenHeight - insets.top - tabBarHeight);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const currentVerseId = useAppStore((state: AppState) => state.currentVerseId);
  const setCurrentVerseId = useAppStore(
    (state: AppState) => state.setCurrentVerseId,
  );
  const language = useAppStore((state: AppState) => state.language);
  const besorahTextVersion = useAppStore(
    (state: AppState) => state.besorahTextVersion,
  );
  const besorahLanguage = useAppStore(
    (state: AppState) => state.besorahLanguage,
  );
  const showQumran = useAppStore((state: AppState) => state.showQumran);
  const translationOnly = useAppStore(
    (state: AppState) => state.translationOnly,
  );
  const hebrewOnly = useAppStore((state: AppState) => state.hebrewOnly);
  const showFullChapter = useAppStore(
    (state: AppState) => state.showFullChapter,
  );
  const seferMode = useAppStore((state: AppState) => state.seferMode);
  const showNikud = useAppStore((state: AppState) => state.showNikud);
  const showCantillation = useAppStore(
    (state: AppState) => state.showCantillation,
  );
  const hebrewFontScale = useAppStore(
    (state: AppState) => state.hebrewFontScale,
  );
  const isConnected = useAppStore((state: AppState) => state.isConnected);
  const DEFAULT_VERSE_ID = "genesis-1-1";
  const normalizeVerseId = (value?: string | null) => {
    if (!value) return DEFAULT_VERSE_ID;
    const [bookId, chapterValue, verseValue] = value.split("-");
    const chapterNumber = Number(chapterValue);
    const verseNumber = Number(verseValue);
    if (
      !bookId ||
      !Number.isFinite(chapterNumber) ||
      chapterNumber <= 0 ||
      !Number.isFinite(verseNumber) ||
      verseNumber <= 0
    ) {
      return DEFAULT_VERSE_ID;
    }
    return `${bookId}-${chapterNumber}-${verseNumber}`;
  };

  const paramId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isStandaloneVerseDetailRoute = Boolean(paramId);
  const bottomContentInset = isStandaloneVerseDetailRoute
    ? insets.bottom
    : getNavigationDockContentPadding(insets.bottom);
  const verseBottomPadding = bottomContentInset + spacing[8];

  // Standalone screens use local state so they never touch the global store
  const [localVerseId, setLocalVerseId] = useState(
    () => normalizeVerseId(paramId),
  );
  const effectiveVerseId = isStandaloneVerseDetailRoute
    ? localVerseId
    : normalizeVerseId(currentVerseId);
  const setEffectiveVerseId = isStandaloneVerseDetailRoute
    ? setLocalVerseId
    : setCurrentVerseId;

  // Keep refs current for the onViewableItemsChanged closure
  const effectiveVerseIdRef = useRef(effectiveVerseId);
  const setEffectiveVerseIdRef = useRef(setEffectiveVerseId);
  useEffect(() => {
    effectiveVerseIdRef.current = effectiveVerseId;
    setEffectiveVerseIdRef.current = setEffectiveVerseId;
  });

  const verseId = effectiveVerseId;
  const readingCalendarState = useCalendar();
  const showCalendarDayPill = useAppStore((state) => state.showCalendarDayPill);
  const hasCalendarDayPill = !!readingCalendarPill(
    readingCalendarState,
    showCalendarDayPill,
  );
  const navigationRowTop = isStandaloneVerseDetailRoute
    ? spacing[1]
    : spacing[16];
  const contentTopPadding =
    navigationRowTop + layout.controlHeight + spacing[6] + (hasCalendarDayPill ? 40 : 0);

  const chapterScrollOffsets = useRef(new Map<string, number>());
  const chapterMeasurements = useRef(new Map<string, Map<number, number>>());
  const [chapterVerses, setChapterVerses] = useState<DisplayVerse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [booksMeta, setBooksMeta] = useState<BookResponse[]>([]);
  const [activeFlowFootnote, setActiveFlowFootnote] =
    useState<TranslationFootnote | null>(null);

  const parseVerseId = (id: string) => {
    const [bookId, chapterValue, verseValue] = id.split("-");
    return {
      bookId,
      chapter: Number(chapterValue || 1),
      verse: Number(verseValue || 1),
    };
  };

  const { bookId, chapter, verse: verseNumber } = parseVerseId(verseId);
  const verse =
    chapterVerses.find((item) => item.verse === verseNumber) ??
    chapterVerses[0];
  const previousTranslationOnlyRef = useRef(translationOnly);

  useEffect(() => {
    if (
      previousTranslationOnlyRef.current &&
      !translationOnly &&
      verse
    ) {
      setEffectiveVerseId(
        `${verse.bookId}-${verse.sourceChapter}-${verse.sourceVerse}`,
      );
    }

    previousTranslationOnlyRef.current = translationOnly;
  }, [setEffectiveVerseId, translationOnly, verse]);

  const bookMeta = useMemo(
    () =>
      booksMeta.find((book) => book.id === (verse?.bookId ?? bookId)) ?? null,
    [bookId, booksMeta, verse?.bookId],
  );
  const isBesorah = bookMeta?.section === "besorah";

  const bookVerses = useMemo(() => chapterVerses, [chapterVerses]);
  const orderedVerses = useMemo(
    () =>
      [...bookVerses].sort(
        (a, b) => a.chapter - b.chapter || a.verse - b.verse,
      ),
    [bookVerses],
  );
  const currentIndex = useMemo(
    () => (verse ? orderedVerses.findIndex((item) => item.id === verse.id) : 0),
    [orderedVerses, verse],
  );
  // Initial positioning must use loaded data and measured geometry.
  const isVersePagerReady =
    !isLoading &&
    measuredHeight > 0 &&
    orderedVerses[0]?.id.startsWith(`${bookId}-${chapter}-`);
  const isChapterFlowMode =
    showFullChapter && seferMode && (translationOnly || hebrewOnly);

  const [showWordHint] = useState(false);
  const swipeSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<(typeof orderedVerses)[number]>>(null);
  const verseScrollMetricsRef = useRef<
    Record<
      string,
      {
        canScroll: boolean;
        offsetY: number;
        contentHeight: number;
        viewportHeight: number;
      }
    >
  >({});
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 70 });
  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: { item: (typeof orderedVerses)[number] }[];
    }) => {
      const next = viewableItems[0]?.item;
      // Ignore callbacks from a chapter that is being replaced.
      const activeChapter = effectiveVerseIdRef.current
        .split("-")
        .slice(0, 2)
        .join("-");
      if (!next?.id.startsWith(`${activeChapter}-`)) return;
      if (next && next.id !== effectiveVerseIdRef.current) {
        setEffectiveVerseIdRef.current(next.id);
      }
    },
  );
  const sheetRef = useRef<BottomSheetMethods>(null!);
  const navigationSheetRef = useRef<NavigationSheetMethods>(null!);
  const [selectedWord, setSelectedWord] = useState<
    (typeof orderedVerses)[number]["words"][number] | null
  >(null);
  const [selectedWordVerseId, setSelectedWordVerseId] = useState<string | null>(
    null,
  );
  const pillVisibility = useRef(new Animated.Value(1)).current;
  const [pillVisible, setPillVisible] = useState(true);
  const [swipeHintCount, setSwipeHintCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadHintCount = async () => {
      const count = await loadSwipeUpHintCount();
      if (!mounted) {
        return;
      }
      setSwipeHintCount(count);
    };

    void loadHintCount();

    return () => {
      mounted = false;
    };
  }, []);

  const animatePill = useCallback(
    (nextVisible: boolean) => {
      setPillVisible(nextVisible);
      Animated.timing(pillVisibility, {
        toValue: nextVisible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [pillVisibility],
  );

  // Listen for tab press to open navigation sheet
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "tabPress",
      (e: TabPressEvent) => {
        // If we're already on this tab, open the navigation sheet
        if (navigation.isFocused()) {
          e.preventDefault();
          // Close word analysis sheet if it's open
          sheetRef.current?.close();
          navigationSheetRef.current?.open();
        }
      },
    );
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener("blur", () =>
      navigationSheetRef.current?.close(),
    );
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    const loadBooks = async () => {
      try {
        const metadata = await fetchMetadata();
        if (!isMounted) return;
        setBooksMeta(metadata.books);
      } catch (error) {
        if (!isMounted) return;
        console.error("Failed to load books metadata:", error);
        setBooksMeta([]);
      }
    };
    loadBooks();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigationSelect = useCallback(
    (nextBookId: string, nextChapter: number, verseNum: number) => {
      const targetId = `${nextBookId}-${nextChapter}-${verseNum}`;
      setEffectiveVerseId(targetId);
      if (nextBookId === bookId && nextChapter === chapter) {
        // Same book+chapter: data is already loaded, scroll immediately
        const nextIndex = orderedVerses.findIndex(
          (item) => item.verse === verseNum,
        );
        if (nextIndex >= 0) {
          listRef.current?.scrollToOffset({
            offset: nextIndex * pageHeight,
            animated: true,
          });
        }
      }
    },
    [orderedVerses, setEffectiveVerseId, bookId, chapter, pageHeight],
  );

  // Track when a word was just selected to prevent race condition with sheet's onClose
  const justSelectedWordRef = useRef(false);

  const handleWordPress = useCallback(
    (word: typeof selectedWord, verseIdForWord: string) => {
      if (!word) return;
      if (isBesorah && besorahTextVersion === "hutter" && !word.strong) {
        return;
      }

      const isSameWord =
        selectedWordVerseId === verseIdForWord &&
        selectedWord?.position === word.position &&
        selectedWord?.text === word.text &&
        selectedWord?.strong === word.strong;

      navigationSheetRef.current?.close();

      if (isSameWord) {
        justSelectedWordRef.current = false;
        setSelectedWord(null);
        setSelectedWordVerseId(null);
        sheetRef.current?.close();
        return;
      }

      justSelectedWordRef.current = true;
      setSelectedWord(word);
      setSelectedWordVerseId(verseIdForWord);
      if (sheetRef.current) {
        sheetRef.current.snapToIndex(0);
      }
    },
    [besorahTextVersion, isBesorah, selectedWord, selectedWordVerseId],
  );

  // Open the word analysis sheet whenever a word is selected
  useEffect(() => {
    if (selectedWord && sheetRef.current) {
      sheetRef.current.snapToIndex(0);
    }
  }, [selectedWord]);

  // Handle sheet close - only clear selectedWord if it wasn't just set
  const handleSheetClosed = useCallback(() => {
    if (justSelectedWordRef.current) {
      // A new word was just selected, don't clear it
      justSelectedWordRef.current = false;
      return;
    }
    // Normal close (user swiped down or tapped backdrop) - clear the selection
    setSelectedWord(null);
    setSelectedWordVerseId(null);
  }, []);

  const handleTogglePills = useCallback(() => {
    animatePill(!pillVisible);
  }, [animatePill, pillVisible]);

  const handleScrollBegin = useCallback(() => {
    if (pillVisible) {
      animatePill(false);
    }
  }, [animatePill, pillVisible]);

  const showSwipeUpHintIfEligible = useCallback(() => {
    setSwipeHintCount((currentCount) => {
      if (currentCount >= SWIPE_HINT_MAX_SHOWS) {
        return currentCount;
      }

      const nextHintCount = currentCount + 1;
      void saveSwipeUpHintCount(nextHintCount);
      return nextHintCount;
    });
  }, []);

  const handleOpenNavigationSheet = useCallback(() => {
    sheetRef.current?.close();
    navigationSheetRef.current?.open();
  }, []);

  const showBoundaryToast = useCallback(
    (direction: "previous" | "next") => {
      const message =
        direction === "previous"
          ? t("verse.firstVerseToast")
          : t("verse.lastVerseToast");

      if (Platform.OS === "android") {
        ToastAndroid.show(message, ToastAndroid.SHORT);
        return;
      }

      Alert.alert(message);
    },
    [t],
  );

  const handleVerseMetricsChange = useCallback(
    (
      verseIdFromPage: string,
      metrics: {
        canScroll: boolean;
        offsetY: number;
        contentHeight: number;
        viewportHeight: number;
      },
    ) => {
      verseScrollMetricsRef.current[verseIdFromPage] = metrics;
    },
    [],
  );

  const handleEdgeSwipe = useCallback(
    (verseIdFromPage: string, direction: "previous" | "next") => {
      const activeIndex = orderedVerses.findIndex(
        (item) => item.id === verseIdFromPage,
      );
      if (activeIndex < 0) {
        return;
      }

      const nextIndex = direction === "next" ? activeIndex + 1 : activeIndex - 1;
      if (nextIndex < 0) {
        showBoundaryToast("previous");
        return;
      }
      if (nextIndex >= orderedVerses.length) {
        showBoundaryToast("next");
        return;
      }

      listRef.current?.scrollToOffset({
        offset: nextIndex * pageHeight,
        animated: true,
      });
      const nextVerse = orderedVerses[nextIndex];
      if (nextVerse) {
        if (swipeSyncTimeoutRef.current) {
          clearTimeout(swipeSyncTimeoutRef.current);
        }
        swipeSyncTimeoutRef.current = setTimeout(() => {
          setEffectiveVerseId(nextVerse.id);
          swipeSyncTimeoutRef.current = null;
        }, 140);
      }

      if (direction === "next" && swipeHintCount < SWIPE_HINT_MAX_SHOWS) {
        showSwipeUpHintIfEligible();
      }
    },
    [
      orderedVerses,
      pageHeight,
      setEffectiveVerseId,
      showBoundaryToast,
      showSwipeUpHintIfEligible,
      swipeHintCount,
    ],
  );

  useEffect(() => {
    return () => {
      if (swipeSyncTimeoutRef.current) {
        clearTimeout(swipeSyncTimeoutRef.current);
      }
    };
  }, []);

  const keyExtractor = useCallback(
    (item: (typeof orderedVerses)[number]) => item.id,
    [],
  );
  const shouldShowSwipeHint = swipeHintCount < SWIPE_HINT_MAX_SHOWS;
  const locationBookLabel =
    language === "he"
      ? stripNikud(bookMeta?.hebrew_name ?? t("common.loading"))
      : formatBookDisplayName(
          language === "es"
            ? (bookMeta?.spanish_name ?? t("common.loading"))
            : (bookMeta?.name ?? t("common.loading")),
        );

  const renderVersePage = useCallback(
    ({
      item,
      index,
    }: {
      item: (typeof orderedVerses)[number];
      index: number;
    }) => (
      <VersePage
        item={item}
        bookLabel={locationBookLabel}
        pillVisibility={pillVisibility}
        pillVisible={pillVisible}
        pageHeight={pageHeight}
        topPadding={contentTopPadding}
        bottomPadding={verseBottomPadding}
        showWordHint={showWordHint}
        isActive={item.id === verse?.id}
        isSelectedVerse={item.id === verse?.id}
        canSwipePrevious={index > 0}
        canSwipeNext={index < orderedVerses.length - 1}
        isBesorah={isBesorah}
        selectedWord={item.id === selectedWordVerseId ? selectedWord : null}
        onVersePress={handleOpenNavigationSheet}
        onWordPress={handleWordPress}
        onNonHebrewPress={handleTogglePills}
        onMetricsChange={handleVerseMetricsChange}
        onEdgeSwipe={handleEdgeSwipe}
        onScrollBegin={handleScrollBegin}
      />
    ),
    [
      locationBookLabel,
      pillVisibility,
      pillVisible,
      pageHeight,
      contentTopPadding,
      verseBottomPadding,
      showWordHint,
      verse?.id,
      orderedVerses.length,
      isBesorah,
      selectedWord,
      selectedWordVerseId,
      handleOpenNavigationSheet,
      handleWordPress,
      handleTogglePills,
      handleVerseMetricsChange,
      handleEdgeSwipe,
      handleScrollBegin,
    ],
  );

  // Clear selectedWord immediately when verse changes to prevent stale word display
  const prevVerseIdRef = useRef(effectiveVerseId);
  useEffect(() => {
    if (prevVerseIdRef.current !== effectiveVerseId) {
      const prevBookId = prevVerseIdRef.current?.split("-")[0];
      const newBookId = effectiveVerseId?.split("-")[0];
      // Only clear if book actually changed (not just verse within same chapter)
      if (prevBookId !== newBookId) {
        setSelectedWord(null);
        setSelectedWordVerseId(null);
        sheetRef.current?.close();
      }
      prevVerseIdRef.current = effectiveVerseId;
    }
  }, [effectiveVerseId]);

  const currentLoadRef = useRef({
    bookId: "",
    chapter: 0,
    language: "en" as AppState["language"],
    showQumran: false,
    translationOnly: false,
    besorahTextVersion: "delitzsch" as AppState["besorahTextVersion"],
    besorahLanguage: "hebrew" as AppState["besorahLanguage"],
    isBesorah: false,
    isConnected: true,
  });
  useEffect(() => {
    if (!bookId) return;
    if (
      currentLoadRef.current.bookId === bookId &&
      currentLoadRef.current.chapter === chapter &&
      currentLoadRef.current.language === language &&
      currentLoadRef.current.showQumran === showQumran &&
      currentLoadRef.current.translationOnly === translationOnly &&
      currentLoadRef.current.besorahTextVersion === besorahTextVersion &&
      currentLoadRef.current.besorahLanguage === besorahLanguage &&
      currentLoadRef.current.isBesorah === isBesorah &&
      currentLoadRef.current.isConnected === isConnected
    ) {
      return;
    }

    let isMounted = true;
    currentLoadRef.current = {
      bookId,
      chapter,
      language,
      showQumran,
      translationOnly,
      besorahTextVersion,
      besorahLanguage,
      isBesorah,
      isConnected,
    };

    const loadVerses = async () => {
      setChapterVerses([]);
      setSelectedWord(null);
      setSelectedWordVerseId(null);
      setIsLoading(true);
      setErrorMessage(null);
      sheetRef.current?.close();

      try {
        const useGreekSource =
          isBesorah &&
          besorahLanguage === "greek" &&
          !translationOnly;
        const hideTranslations =
          !useGreekSource && !translationOnly && language === "he";
        const greekOverlayLanguage = useGreekSource
          ? resolveGreekOverlayLanguage(language, translationOnly)
          : undefined;
        const hebrewTranslationLanguage: "en" | "es" | undefined = translationOnly
          ? language === "es"
            ? "es"
            : "en"
          : hideTranslations
            ? undefined
            : language === "es"
              ? "es"
              : "en";
        const chapterOptions = {
          language: hebrewTranslationLanguage,
          hebrewOnly: hideTranslations,
          isConnected,
          referenceMode: translationOnly
            ? ("translation" as const)
            : ("source" as const),
          besorahTextVersion,
        };
        const verses = useGreekSource
          ? await fetchGreekChapterVerses(bookId, chapter, {
              language: greekOverlayLanguage,
              isConnected,
            })
          : await fetchChapterVerses(bookId, chapter, {
              ...chapterOptions,
              showDss: false,
            });
        if (!isMounted) return;
        const isCurrentLoad = () =>
          currentLoadRef.current.bookId === bookId &&
          currentLoadRef.current.chapter === chapter &&
          currentLoadRef.current.language === language &&
          currentLoadRef.current.showQumran === showQumran &&
          currentLoadRef.current.translationOnly === translationOnly &&
          currentLoadRef.current.besorahTextVersion === besorahTextVersion &&
          currentLoadRef.current.besorahLanguage === besorahLanguage &&
          currentLoadRef.current.isBesorah === isBesorah &&
          currentLoadRef.current.isConnected === isConnected;
        if (!isCurrentLoad()) {
          return;
        }
        setChapterVerses(verses);
        if (isMounted) setIsLoading(false);
        if (!useGreekSource && showQumran) {
          const enriched = await fetchChapterVerses(bookId, chapter, {
            ...chapterOptions,
            showDss: true,
          });
          if (!isMounted || !isCurrentLoad()) return;
          setChapterVerses(enriched);
        }
      } catch {
        if (!isMounted) return;
        setErrorMessage(t("errors.loadVerses"));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadVerses();
    return () => {
      isMounted = false;
    };
  }, [
    besorahTextVersion,
    besorahLanguage,
    bookId,
    chapter,
    language,
    showQumran,
    translationOnly,
    isConnected,
    isBesorah,
    t,
  ]);

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View
          style={styles.container}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            setMeasuredHeight((currentHeight) =>
              Math.abs(currentHeight - nextHeight) > EDGE_EPSILON
                ? nextHeight
                : currentHeight,
            );
          }}
        >
          {showFullChapter && (
            <View
              style={[styles.navigationRow, { top: navigationRowTop }]}
              pointerEvents="box-none"
            >
              <Animated.View
                pointerEvents={pillVisible ? "auto" : "none"}
                style={{
                  opacity: pillVisibility,
                  transform: [
                    {
                      translateY: pillVisibility.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12, 0],
                      }),
                    },
                  ],
                }}
              >
                <CalendarDayPill />
                <BookChapterPill
                  bookLabel={locationBookLabel}
                  chapter={verse?.chapter ?? chapter}
                  onPress={handleOpenNavigationSheet}
                />
              </Animated.View>
            </View>
          )}
          {isLoading ? <VerseCardSkeleton pageHeight={pageHeight} /> : null}
          {errorMessage ? (
            <View
              style={{ paddingHorizontal: spacing[6], paddingTop: spacing[12] }}
            >
              <Text
                style={{ textAlign: "center", color: colors.textSecondary }}
              >
                {errorMessage}
              </Text>
            </View>
          ) : null}
          {showFullChapter ? (
            !isLoading && orderedVerses[0]?.id.startsWith(`${bookId}-${chapter}-`) && (
            <FullChapterView
              verses={orderedVerses}
              locationKey={`${bookId}-${chapter}:${screenWidth}:${hebrewFontScale}:${hebrewOnly}:${translationOnly}:${language}:${besorahLanguage}:${besorahTextVersion}:${showNikud}:${showCantillation}`}
              targetId={effectiveVerseId}
              offsets={chapterScrollOffsets.current}
              measurements={chapterMeasurements.current}
              topPadding={contentTopPadding}
              style={styles.chapterTranslationScroll}
              contentStyle={[styles.chapterTranslationContent, { paddingTop: contentTopPadding }]}
              gap={layout.chapterGap}
              renderVerse={item => (
                <VerseCard verse={item} variant="detail" showWordHint={false}
                  selectedWord={item.id === selectedWordVerseId ? selectedWord : null}
                  isBesorah={isBesorah} onVersePress={handleOpenNavigationSheet}
                  onWordPress={word => handleWordPress(word, item.id)} />
              )}
              renderFlow={isChapterFlowMode ? (flowItems) => (
                <ChapterFlow
                  flowItems={flowItems}
                  translationOnly={translationOnly}
                  language={language}
                  styles={styles}
                  colors={colors}
                  hebrewFontScale={hebrewFontScale}
                  textScale={layout.textScale}
                  besorahLanguage={besorahLanguage}
                  showNikud={showNikud}
                  showCantillation={showCantillation}
                  selectedWordVerseId={selectedWordVerseId}
                  selectedWord={selectedWord}
                  onTogglePills={handleTogglePills}
                  onWordPress={handleWordPress}
                  onFootnotePress={setActiveFlowFootnote}
                  t={t}
                />
              ) : undefined}
            />
            )
          ) : (
            isVersePagerReady && (
              <FlatList
                // A new chapter or height needs a fresh initialScrollIndex.
                key={`${bookId}-${chapter}:${pageHeight}`}
                ref={listRef}
                data={orderedVerses}
                keyExtractor={keyExtractor}
                renderItem={renderVersePage}
                directionalLockEnabled
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={pageHeight}
                snapToAlignment="start"
                windowSize={5}
                initialNumToRender={3}
                maxToRenderPerBatch={4}
                updateCellsBatchingPeriod={50}
                initialScrollIndex={Math.max(currentIndex, 0)}
                getItemLayout={(_, index) => ({
                  length: pageHeight,
                  offset: pageHeight * index,
                  index,
                })}
                viewabilityConfig={viewabilityConfigRef.current}
                onViewableItemsChanged={onViewableItemsChanged.current}
              />
            )
          )}
          {shouldShowSwipeHint && !showFullChapter ? (
            <View
              pointerEvents="none"
              style={[
                styles.swipeHintRow,
                { bottom: bottomContentInset + spacing[1] },
              ]}
            >
              <Text style={styles.swipeHintText}>
                {t("verse.swipeUpNextVerseHint")}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
      <WordAnalysisBottomSheet
        ref={sheetRef}
        word={selectedWord}
        currentVerseId={selectedWordVerseId ?? effectiveVerseId}
        isBesorah={isBesorah}
        onClosed={handleSheetClosed}
        hasNavigationDock={!isStandaloneVerseDetailRoute}
      />
      <NavigationSheet
        ref={navigationSheetRef}
        currentBookId={verse?.bookId ?? bookId}
        currentChapter={verse?.chapter ?? chapter}
        currentVerse={verse?.verse ?? verseNumber}
        translationOnly={translationOnly}
        currentChapterVerseNumbers={orderedVerses.map((item) => item.verse)}
        hasNavigationDock={!isStandaloneVerseDetailRoute}
        onSelectVerse={handleNavigationSelect}
      />
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(activeFlowFootnote)}
        onRequestClose={() => setActiveFlowFootnote(null)}
      >
        <Pressable
          style={styles.chapterFootnoteOverlay}
          onPress={() => setActiveFlowFootnote(null)}
        >
          <Pressable
            style={styles.chapterFootnoteCard}
            onPress={(event) => event.stopPropagation()}
          >
            {activeFlowFootnote?.word ? (
              <Text style={styles.chapterFootnoteWord}>
                {activeFlowFootnote.word}
              </Text>
            ) : null}
            <Text style={styles.chapterFootnoteText}>
              {activeFlowFootnote?.explanation ?? ""}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};
