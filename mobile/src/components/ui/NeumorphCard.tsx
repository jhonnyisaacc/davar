import { PropsWithChildren, useMemo } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import {
  getColors,
  getNeumorphHighlightStyle,
  getNeumorphShadowStyle,
  radii,
  spacing,
} from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";

type NeumorphCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  padding?: number;
}>;

const createStyles = (colors: ReturnType<typeof getColors>, padding: number) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.neomorphBg,
      borderRadius: radii.lg,
      padding,
      borderWidth: 0,
    },
    highlight: {
      ...StyleSheet.absoluteFill,
      ...Platform.select({
        ios: getNeumorphHighlightStyle(colors),
        android: {},
        default: {},
      }),
    },
  });

export const NeumorphCard = ({
  children,
  style,
  padding = spacing[6],
}: NeumorphCardProps) => {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(
    () => createStyles(colors, padding),
    [colors, padding],
  );

  return (
    <View
      style={[
        styles.container,
        getNeumorphShadowStyle("raised", colors),
        style,
      ]}
    >
      <View pointerEvents="none" style={styles.highlight} />
      {children}
    </View>
  );
};
