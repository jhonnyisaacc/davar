export const VERSE_SCROLL_EDGE_EPSILON = 2;
const SWIPE_VELOCITY_THRESHOLD = 600;

type VerseSwipe = {
  startOffsetY: number;
  offsetY: number;
  maxOffsetY: number;
  velocityY: number;
};

export function getVerseSwipeDirection({
  startOffsetY,
  offsetY,
  maxOffsetY,
  velocityY,
}: VerseSwipe): "previous" | "next" | null {
  "worklet";

  // Reaching an edge reveals the rest of the verse. Paging needs a new swipe
  // that starts there, including when the native ScrollView cannot move further.
  if (
    velocityY < -SWIPE_VELOCITY_THRESHOLD &&
    startOffsetY >= maxOffsetY - VERSE_SCROLL_EDGE_EPSILON &&
    offsetY >= maxOffsetY - VERSE_SCROLL_EDGE_EPSILON
  ) {
    return "next";
  }

  if (
    velocityY > SWIPE_VELOCITY_THRESHOLD &&
    startOffsetY <= VERSE_SCROLL_EDGE_EPSILON &&
    offsetY <= VERSE_SCROLL_EDGE_EPSILON
  ) {
    return "previous";
  }

  return null;
}
