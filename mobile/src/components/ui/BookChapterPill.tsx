import { Pressable, StyleSheet, Text } from "react-native";

import { getColors, radii, spacing, typography } from "@/src/theme";
import { useAppStore } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";

type BookChapterPillProps = {
  bookLabel: string;
  chapter: number;
  onPress: () => void;
};

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    maxWidth: "100%",
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: typography.sizes.caption,
    textAlign: "center",
  },
});

export const BookChapterPill = ({
  bookLabel,
  chapter,
  onPress,
}: BookChapterPillProps) => {
  const themeMode = useAppStore((state) => state.themeMode);
  const colors = getColors(themeMode);
  const { t, isRTL } = useTranslation();
  const label = `${bookLabel} · ${chapter}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("navigation.selectLocation")}
      testID="reading-location-chip"
      hitSlop={spacing[2]}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: colors.textPrimary,
            fontFamily: isRTL
              ? "Arimo_400Regular"
              : typography.families.latinUI,
            writingDirection: isRTL ? "rtl" : "ltr",
          },
        ]}
      >
        {bookLabel} · {"\u2066"}
        {chapter}
        {"\u2069"}
      </Text>
    </Pressable>
  );
};
