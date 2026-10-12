export const NAVIGATION_DOCK_HEIGHT = 72;

export function getNavigationDockBottomInset(bottomInset: number) {
  return Math.max(bottomInset, 8);
}

export function getNavigationDockContentPadding(bottomInset: number) {
  return (
    NAVIGATION_DOCK_HEIGHT + getNavigationDockBottomInset(bottomInset) + 12
  );
}
