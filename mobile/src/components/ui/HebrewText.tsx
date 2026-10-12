import { useMemo } from "react";
import { StyleProp, StyleSheet, Text, TextStyle } from "react-native";

import { getColors, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";

type HebrewTextProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  size?: number;
};

const createStyles = (colors: ReturnType<typeof getColors>, fontSize: number) =>
  StyleSheet.create({
    text: {
      fontFamily: typography.families.hebrewScripture,
      fontSize,
      lineHeight: fontSize * typography.lineHeights.hebrewScripture,
      color: colors.textHebrew,
      textAlign: "right",
      writingDirection: "rtl",
    },
  });

export const HebrewText = ({
  children,
  style,
  size = typography.sizes.hebrewVerse,
}: HebrewTextProps) => {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);

  return <Text style={[styles.text, style]}>{children}</Text>;
};
