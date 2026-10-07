import { StyleSheet } from "react-native";
import { getColors, getResponsiveLayout, spacing, typography } from "@/src/theme";

export const createStyles = (colors: ReturnType<typeof getColors>, layout: ReturnType<typeof getResponsiveLayout>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    navigationRow: {
      position: "absolute",
      top: spacing[16],
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 10,
      elevation: 10,
    },
    swipeHintRow: {
      position: "absolute",
      left: spacing[4],
      right: spacing[4],
      alignItems: "center",
      zIndex: 12,
      elevation: 12,
    },
    swipeHintText: {
      fontFamily: typography.families.latinUI,
      fontSize: 10,
      color: colors.textSecondary,
      textAlign: "center",
    },
    chapterTranslationScroll: {
      flex: 1,
      paddingHorizontal: layout.horizontalPadding,
      paddingBottom: spacing[8],
    },
    chapterTranslationContent: {
      width: "100%",
      maxWidth: layout.contentMaxWidth,
      alignSelf: "center",
      paddingTop: spacing[16],
      paddingBottom: spacing[16],
    },
    chapterVerseList: {
      rowGap: layout.chapterGap,
    },
    chapterTranslationFlowText: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.body + 1,
      lineHeight: (typography.sizes.body + 1) * typography.lineHeights.body,
      color: colors.textPrimary,
      opacity: 0.84,
    },
    chapterTranslationVerseNumber: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.caption + 1,
      color: colors.textPrimary,
      opacity: 0.68,
      letterSpacing: 0.8,
      marginRight: spacing[1],
    },
    chapterHebrewFlowText: {
      fontFamily: typography.families.hebrewScripture,
      fontSize: typography.sizes.hebrewVerseMedium * 1.06,
      lineHeight:
        typography.sizes.hebrewVerseMedium * typography.lineHeights.hebrewScripture,
      color: colors.textPrimary,
      textAlign: "right",
      writingDirection: "rtl",
      letterSpacing: 0.3,
    },
    chapterHebrewVerseNumber: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.caption + 1,
      color: colors.textPrimary,
      opacity: 0.68,
      letterSpacing: 0.8,
    },
    chapterFootnoteOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing[6],
    },
    chapterFootnoteCard: {
      width: "100%",
      // Percentage width prevents phone-sized dialogs on iPad and split view.
      maxWidth: layout.modalWidth,
      borderRadius: 14,
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[4],
      backgroundColor: colors.neomorphBg,
      borderWidth: 1,
      borderColor: colors.neomorphBorder,
    },
    chapterFootnoteHeading: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
      marginBottom: spacing[2],
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    chapterFootnoteWord: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.body,
      color: colors.textPrimary,
      fontWeight: "600",
      marginBottom: spacing[2],
    },
    chapterFootnoteText: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.body,
      lineHeight: typography.sizes.body * typography.lineHeights.body,
      color: colors.textPrimary,
    },
  });
