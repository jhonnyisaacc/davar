import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  cancelAnimation,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { VerseCard } from "@/src/components/VerseCard";
import {
  getVerseSwipeDirection,
  VERSE_SCROLL_EDGE_EPSILON as EDGE_EPSILON,
} from "@/src/services/versePaging";
import { CalendarDayPill } from "@/src/features/calendar/CalendarDayPill";
import { BookChapterPill } from "@/src/components/ui/BookChapterPill";
import { getResponsiveLayout, spacing } from "@/src/theme";
import type { DisplayVerse } from "@/src/services/scripture";

type VersePageProps = {
  item: DisplayVerse;
  bookLabel: string;
  pillVisibility: Animated.Value;
  pillVisible: boolean;
  pageHeight: number;
  topPadding: number;
  bottomPadding: number;
  showWordHint: boolean;
  isActive: boolean;
  isSelectedVerse: boolean;
  canSwipePrevious: boolean;
  canSwipeNext: boolean;
  isBesorah: boolean;
  onVersePress: () => void;
  selectedWord: DisplayVerse["words"][number] | null;
  onWordPress: (
    word: DisplayVerse["words"][number] | null,
    verseId: string,
  ) => void;
  onNonHebrewPress: () => void;
  onMetricsChange: (
    verseId: string,
    metrics: {
      canScroll: boolean;
      offsetY: number;
      contentHeight: number;
      viewportHeight: number;
    },
  ) => void;
  onEdgeSwipe: (verseId: string, direction: "previous" | "next") => void;
  onScrollBegin?: () => void;
};

const HEBREW_PRESS_SUPPRESSION_MS = 250;

const VersePageComponent = ({
  item,
  bookLabel,
  pillVisibility,
  pillVisible,
  pageHeight,
  topPadding,
  bottomPadding,
  showWordHint,
  isActive,
  isSelectedVerse,
  canSwipePrevious,
  canSwipeNext,
  isBesorah,
  onVersePress,
  selectedWord,
  onWordPress,
  onNonHebrewPress,
  onMetricsChange,
  onEdgeSwipe,
  onScrollBegin,
}: VersePageProps) => {
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const { width, height } = useWindowDimensions();
  const layout = getResponsiveLayout(width, height);
  const horizontalPadding = layout.isTablet ? layout.horizontalPadding : spacing[4];
  const canScroll = contentHeight > viewportHeight + EDGE_EPSILON;
  const effectiveTopPadding = canScroll ? topPadding : spacing[6];
  const lastHebrewPressInRef = useRef(0);
  // A swipe ending over a word must not also open its analysis sheet.
  const isSwipingRef = useRef(false);

  const handleTouchStart = useCallback(() => {
    isSwipingRef.current = false;
  }, []);

  const handleSwipeStart = useCallback(() => {
    if (isSwipingRef.current) return;
    isSwipingRef.current = true;
    onScrollBegin?.();
  }, [onScrollBegin]);

  const handleVersePress = useCallback(() => {
    if (!isSwipingRef.current) onVersePress();
  }, [onVersePress]);

  const handleWordPress = useCallback(
    (word: DisplayVerse["words"][number]) => {
      if (!isSwipingRef.current) onWordPress(word, item.id);
    },
    [item.id, onWordPress],
  );

  const markHebrewPressIn = useCallback(() => {
    lastHebrewPressInRef.current = Date.now();
  }, []);

  const handleNonHebrewAreaPress = useCallback(() => {
    // Ignore bubbling taps immediately following Hebrew word/verse interactions.
    if (
      isSwipingRef.current ||
      Date.now() - lastHebrewPressInRef.current < HEBREW_PRESS_SUPPRESSION_MS
    ) {
      return;
    }
    onNonHebrewPress();
  }, [onNonHebrewPress]);

  useEffect(() => {
    onMetricsChange(item.id, {
      canScroll,
      offsetY: 0,
      contentHeight,
      viewportHeight,
    });
  }, [canScroll, contentHeight, item.id, onMetricsChange, viewportHeight]);

  const scrollOffsetY = useSharedValue(0);
  const swipeStartOffsetY = useSharedValue(0);
  const nativeScrollGesture = useMemo(() => Gesture.Native(), []);
  const handleScroll = useAnimatedScrollHandler(
    (event) => {
      scrollOffsetY.value = event.contentOffset.y;
      if (!isActive) {
        return;
      }

      runOnJS(onMetricsChange)(item.id, {
        canScroll,
        offsetY: event.contentOffset.y,
        contentHeight: event.contentSize.height,
        viewportHeight: event.layoutMeasurement.height,
      });
    },
    [canScroll, isActive, item.id, onMetricsChange],
  );

  const swipeTranslateY = useSharedValue(0);

  useEffect(() => {
    swipeTranslateY.value = 0;
  }, [item.id, isActive, swipeTranslateY]);

  const animatedSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: swipeTranslateY.value }],
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isActive)
        .simultaneousWithExternalGesture(nativeScrollGesture)
        .onBegin(() => {
          runOnJS(handleTouchStart)();
          swipeStartOffsetY.value = scrollOffsetY.value;
          cancelAnimation(swipeTranslateY);
          swipeTranslateY.value = 0;
        })
        .onStart(() => {
          runOnJS(handleSwipeStart)();
        })
        .onUpdate((event) => {
          if (!canScroll) {
            swipeTranslateY.value = event.translationY * 0.2;
          }
        })
        .onEnd((event) => {
          const direction = getVerseSwipeDirection({
            startOffsetY: swipeStartOffsetY.value,
            offsetY: scrollOffsetY.value,
            maxOffsetY: Math.max(0, contentHeight - viewportHeight),
            velocityY: event.velocityY,
          });

          if (direction) {
            if (
              (direction === "next" && !canSwipeNext) ||
              (direction === "previous" && !canSwipePrevious)
            ) {
              swipeTranslateY.value = withSpring(0, {
                damping: 20,
                stiffness: 300,
              });
            }
            runOnJS(onEdgeSwipe)(item.id, direction);
          } else if (!canScroll) {
            swipeTranslateY.value = withSpring(0, {
              damping: 20,
              stiffness: 300,
            });
          }
        }),
    [
      canScroll,
      canSwipeNext,
      canSwipePrevious,
      contentHeight,
      handleSwipeStart,
      handleTouchStart,
      isActive,
      item.id,
      nativeScrollGesture,
      onEdgeSwipe,
      scrollOffsetY,
      swipeStartOffsetY,
      swipeTranslateY,
      viewportHeight,
    ],
  );

  const verseContent = (
    <View
      style={{
        minHeight: pageHeight,
        width: "100%",
        maxWidth: layout.contentMaxWidth,
        alignSelf: "center",
        justifyContent: canScroll ? "flex-start" : "center",
        paddingHorizontal: horizontalPadding,
        paddingTop: effectiveTopPadding,
        paddingBottom: bottomPadding,
        gap: spacing[5],
      }}
      onTouchEnd={handleNonHebrewAreaPress}
    >
      <Animated.View
        pointerEvents={pillVisible ? "auto" : "none"}
        style={{ opacity: pillVisibility }}
      >
        <CalendarDayPill />
        <BookChapterPill
          bookLabel={bookLabel}
          chapter={item.chapter}
          onPress={handleVersePress}
        />
      </Animated.View>
      <VerseCard
        verse={item}
        variant="detail"
        showWordHint={showWordHint && isSelectedVerse}
        selectedWord={isSelectedVerse ? selectedWord : null}
        isBesorah={isBesorah}
        onVersePress={handleVersePress}
        onWordPress={handleWordPress}
        onHebrewPressIn={markHebrewPressIn}
      />
    </View>
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        pointerEvents={isActive ? "auto" : "none"}
        style={[
          {
            height: pageHeight,
            width: "100%",
          },
          canScroll ? undefined : animatedSwipeStyle,
        ]}
      >
        <GestureDetector gesture={nativeScrollGesture}>
          <Reanimated.ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            nestedScrollEnabled={canScroll}
            scrollEnabled={canScroll}
            scrollEventThrottle={16}
            onLayout={(event) => {
              setViewportHeight(event.nativeEvent.layout.height);
            }}
            onContentSizeChange={(_, height) => {
              setContentHeight(height);
            }}
            onScrollBeginDrag={handleSwipeStart}
            onScroll={handleScroll}
            contentContainerStyle={{
              minHeight: pageHeight,
            }}
          >
            {verseContent}
          </Reanimated.ScrollView>
        </GestureDetector>
      </Reanimated.View>
    </GestureDetector>
  );
};

export const VersePage = memo(
  VersePageComponent,
  (prevProps, nextProps) =>
    prevProps.item.id === nextProps.item.id &&
    prevProps.bookLabel === nextProps.bookLabel &&
    prevProps.pillVisibility === nextProps.pillVisibility &&
    prevProps.pillVisible === nextProps.pillVisible &&
    prevProps.pageHeight === nextProps.pageHeight &&
    prevProps.topPadding === nextProps.topPadding &&
    prevProps.bottomPadding === nextProps.bottomPadding &&
    prevProps.showWordHint === nextProps.showWordHint &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isSelectedVerse === nextProps.isSelectedVerse &&
    prevProps.canSwipePrevious === nextProps.canSwipePrevious &&
    prevProps.canSwipeNext === nextProps.canSwipeNext &&
    prevProps.isBesorah === nextProps.isBesorah &&
    (prevProps.isSelectedVerse ? prevProps.selectedWord : null) ===
      (nextProps.isSelectedVerse ? nextProps.selectedWord : null) &&
    prevProps.onVersePress === nextProps.onVersePress &&
    prevProps.onWordPress === nextProps.onWordPress &&
    prevProps.onNonHebrewPress === nextProps.onNonHebrewPress &&
    prevProps.onMetricsChange === nextProps.onMetricsChange &&
    prevProps.onEdgeSwipe === nextProps.onEdgeSwipe &&
    prevProps.onScrollBegin === nextProps.onScrollBegin,
);
