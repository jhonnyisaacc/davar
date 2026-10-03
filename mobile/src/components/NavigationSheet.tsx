import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Search, X } from "lucide-react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  getColors,
  getResponsiveLayout,
  radii,
  spacing,
  typography,
} from "@/src/theme";
import { fetchMetadata } from "@/src/services/metadata";
import { centeredBookOffset } from "@/src/services/navigationPositioning";
import { getNavigationVerseNumbers } from "@/src/services/navigationSelection";
import { useAppStore } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";
import { GREEK_BESORAH_BOOK_NAMES } from "@davar/shared/greekBesorah";
import { formatBookDisplayName } from "../utils/bookNameFormatter";
import { stripNikud } from "../utils/hebrew";

type NavigationSheetProps = {
  currentBookId: string;
  currentChapter: number;
  currentVerse: number;
  translationOnly?: boolean;
  currentChapterVerseNumbers?: number[];
  hasNavigationDock?: boolean;
  onSelectVerse: (bookId: string, chapter: number, verse: number) => void;
  onClose?: () => void;
};

export type NavigationSheetMethods = {
  open: () => void;
  close: () => void;
};

type Metadata = Awaited<ReturnType<typeof fetchMetadata>>;
type SelectionItem = { id: string; label: string };

const createStyles = (
  colors: ReturnType<typeof getColors>,
  rtl: boolean,
  accentColor: string,
) =>
  StyleSheet.create({
    screen: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.background,
      zIndex: 20,
      elevation: 20,
    },
    body: {
      flex: 1,
      width: "100%",
      alignSelf: "center",
      paddingHorizontal: spacing[5],
      paddingTop: spacing[4],
      gap: spacing[3],
    },
    header: {
      flexDirection: rtl ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 28,
    },
    hint: {
      flex: 1,
      color: accentColor,
      fontFamily: rtl ? "Arimo_400Regular" : typography.families.latinUI,
      fontSize: typography.sizes.caption,
      letterSpacing: rtl ? 0 : 1.2,
      textAlign: rtl ? "right" : "left",
    },
    actions: {
      flexDirection: "row",
      gap: spacing[2],
    },
    iconButton: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    searchInput: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.sm,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      fontFamily: rtl ? "Arimo_400Regular" : typography.families.latinUI,
      fontSize: typography.sizes.bodySmall,
      color: colors.textPrimary,
      textAlign: rtl ? "right" : "left",
    },
    picker: {
      flex: 1,
      minHeight: 0,
      flexDirection: rtl ? "row-reverse" : "row",
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing[2],
      overflow: "hidden",
    },
    column: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: spacing[1],
      paddingTop: spacing[2],
      gap: spacing[1],
    },
    divider: {
      borderLeftWidth: rtl ? 1 : 0,
      borderRightWidth: rtl ? 0 : 1,
      borderColor: colors.border,
    },
    columnHeading: {
      color: accentColor,
      fontFamily: rtl ? "Arimo_700Bold" : typography.families.latinUISemiBold,
      fontSize: 10,
      letterSpacing: rtl ? 0 : 1.4,
      textAlign: "center",
    },
    list: {
      flex: 1,
    },
    listContent: {
      gap: spacing[1],
      paddingBottom: spacing[2],
    },
    row: {
      borderRadius: radii.sm,
      paddingHorizontal: spacing[1],
      alignItems: "center",
      justifyContent: "center",
    },
    selectedRow: {
      backgroundColor: `${colors.primary}1F`,
    },
    rowLabel: {
      fontFamily: rtl ? "Arimo_400Regular" : typography.families.latinUI,
      fontSize: 13,
      color: colors.textPrimary,
      textAlign: "center",
    },
    bookLabel: {
      fontSize: typography.sizes.caption,
    },
    selectedLabel: {
      color: accentColor,
    },
    selectedBookLabel: {
      fontFamily: rtl ? "Arimo_400Regular" : "Manrope_600SemiBold",
    },
    emptyText: {
      color: colors.textSecondary,
      fontFamily: rtl ? "Arimo_400Regular" : typography.families.latinUI,
      fontSize: typography.sizes.caption,
      textAlign: "center",
      paddingVertical: spacing[4],
    },
  });

function SelectionColumn({
  title,
  items,
  selectedId,
  onSelect,
  emptyLabel,
  bookColumn = false,
  divider = false,
  styles,
  rowHeight,
}: {
  title: string;
  items: SelectionItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
  bookColumn?: boolean;
  divider?: boolean;
  styles: ReturnType<typeof createStyles>;
  rowHeight: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);

  useEffect(() => {
    if (selectedIndex < 0 || viewportHeight <= 0 || contentHeight <= 0) return;
    scrollRef.current?.scrollTo({
      y: centeredBookOffset(
        selectedIndex,
        rowHeight + spacing[1],
        viewportHeight,
      ),
      animated: false,
    });
  }, [selectedIndex, rowHeight, viewportHeight, contentHeight]);

  return (
    <View style={[styles.column, divider && styles.divider]}>
      <Text accessibilityRole="header" style={styles.columnHeading}>
        {title}
      </Text>
      <ScrollView
        ref={scrollRef}
        accessibilityLabel={title}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_width, height) => setContentHeight(height)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${title} ${item.label}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [
                styles.row,
                { height: rowHeight, opacity: pressed ? 0.65 : 1 },
                selected && styles.selectedRow,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.rowLabel,
                  bookColumn && styles.bookLabel,
                  selected && styles.selectedLabel,
                  selected && bookColumn && styles.selectedBookLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        {!items.length && <Text style={styles.emptyText}>{emptyLabel}</Text>}
      </ScrollView>
    </View>
  );
}

const NavigationSheetComponent = (
  {
    currentBookId,
    currentChapter,
    currentVerse,
    translationOnly = false,
    currentChapterVerseNumbers,
    hasNavigationDock = true,
    onSelectVerse,
    onClose,
  }: NavigationSheetProps,
  ref: React.ForwardedRef<NavigationSheetMethods>,
) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(currentBookId);
  const [selectedChapter, setSelectedChapter] = useState(currentChapter);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loadError, setLoadError] = useState(false);
  const themeMode = useAppStore((state) => state.themeMode);
  const language = useAppStore((state) => state.language);
  const colors = getColors(themeMode);
  const { t, isRTL } = useTranslation();
  const { width, height, fontScale } = useWindowDimensions();
  const layout = getResponsiveLayout(width, height);
  const insets = useSafeAreaInsets();
  const accentColor =
    themeMode === "dark" ? colors.primaryLight : colors.primaryDeep;
  const styles = useMemo(
    () => createStyles(colors, isRTL, accentColor),
    [colors, isRTL, accentColor],
  );
  const rowHeight = Math.max(36, Math.ceil(36 * fontScale));

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setSelectedBookId(currentBookId);
        setSelectedChapter(currentChapter);
        setSearchQuery("");
        setSearchVisible(false);
        setIsOpen(true);
      },
      close,
    }),
    [close, currentBookId, currentChapter],
  );

  useEffect(() => {
    let mounted = true;
    fetchMetadata()
      .then((value) => {
        if (mounted) {
          setMetadata(value);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [close, isOpen]);

  const getBookDisplayName = useCallback(
    (book: Metadata["books"][number]) => {
      if (language === "he") return stripNikud(book.hebrew_name);
      return formatBookDisplayName(
        language === "es" && book.spanish_name.trim()
          ? book.spanish_name
          : book.name,
      );
    },
    [language],
  );

  const books = useMemo(() => {
    const query = stripNikud(searchQuery.trim()).toLowerCase();
    return (metadata?.books ?? [])
      .filter(
        (book) =>
          !query ||
          [
            book.name,
            book.spanish_name,
            stripNikud(book.hebrew_name),
            GREEK_BESORAH_BOOK_NAMES[book.id] ?? "",
          ].some((name) =>
            formatBookDisplayName(name).toLowerCase().includes(query),
          ),
      )
      .map((book) => ({ id: book.id, label: getBookDisplayName(book) }));
  }, [getBookDisplayName, metadata, searchQuery]);

  const chapters = metadata?.chapter_counts[selectedBookId] ?? [];
  const verseNumbers = getNavigationVerseNumbers({
    bookId: selectedBookId,
    chapter: selectedChapter,
    currentBookId,
    currentChapter,
    translationOnly,
    currentChapterVerseNumbers,
    verseCounts: metadata?.verse_counts ?? {},
  });
  const selectedVerse =
    selectedBookId === currentBookId && selectedChapter === currentChapter
      ? currentVerse
      : verseNumbers[0];

  if (!isOpen) return null;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
      testID="navigation-bcv-picker"
    >
      <View
        style={[
          styles.body,
          {
            maxWidth: layout.navigationWidth,
            paddingBottom: hasNavigationDock
              ? 72 + Math.max(insets.bottom, 8) + spacing[4]
              : insets.bottom + spacing[4],
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.hint}>{t("navigation.selectLocation")}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("navigation.searchBooks")}
              accessibilityState={{ expanded: searchVisible }}
              style={styles.iconButton}
              onPress={() => {
                setSearchVisible(!searchVisible);
                setSearchQuery("");
              }}
            >
              <Search size={16} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("navigation.closePicker")}
              style={styles.iconButton}
              onPress={close}
              testID="navigation-close-button"
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
        {searchVisible && (
          <TextInput
            autoFocus
            style={styles.searchInput}
            accessibilityLabel={t("navigation.searchBooks")}
            placeholder={t("navigation.searchBooks")}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        )}
        <View style={styles.picker}>
          <SelectionColumn
            title={t("navigation.selectBook")}
            items={books}
            selectedId={selectedBookId}
            onSelect={(bookId) => {
              if (bookId !== selectedBookId) {
                setSelectedBookId(bookId);
                setSelectedChapter(metadata?.chapter_counts[bookId]?.[0] ?? 1);
              }
            }}
            emptyLabel={
              loadError
                ? t("errors.loadBooks")
                : metadata
                  ? t("navigation.noBooksFound")
                  : t("navigation.loadingBooks")
            }
            bookColumn
            divider
            styles={styles}
            rowHeight={rowHeight}
          />
          <SelectionColumn
            title={t("navigation.selectChapter")}
            items={chapters.map((chapter) => ({
              id: String(chapter),
              label: String(chapter),
            }))}
            selectedId={String(selectedChapter)}
            onSelect={(id) => setSelectedChapter(Number(id))}
            emptyLabel={t("navigation.noChapters")}
            divider
            styles={styles}
            rowHeight={rowHeight}
          />
          <SelectionColumn
            title={t("navigation.selectVerse")}
            items={verseNumbers.map((verse) => ({
              id: String(verse),
              label: String(verse),
            }))}
            selectedId={String(selectedVerse)}
            onSelect={(id) => {
              onSelectVerse(selectedBookId, selectedChapter, Number(id));
              close();
            }}
            emptyLabel={t("navigation.noVerses")}
            styles={styles}
            rowHeight={rowHeight}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

export const NavigationSheet = React.forwardRef<
  NavigationSheetMethods,
  NavigationSheetProps
>(NavigationSheetComponent);
