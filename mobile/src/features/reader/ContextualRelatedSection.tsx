import {
  contextualRelationships,
  formatRelatedReference,
  loadedEntries,
  type RelatedLoad,
  relatedRequest,
  type VerseRef,
  watchRelated,
} from "@davar/shared/contextualRelationships";
import { formatDefinitionMeaningForDisplay } from "@davar/shared/definitionMeanings";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslation } from "@/src/i18n/useTranslation";
import { loadRelatedGloss } from "@/src/services/lexicon";
import type { AppLanguage } from "@/src/services/storage";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { getColors, spacing, typography } from "@/src/theme";

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing[6],
    },
    entry: {
      alignItems: "center",
      gap: spacing[2],
    },
    label: {
      fontFamily: typography.families.latinUIBold,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      textAlign: "center",
    },
    note: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
      textAlign: "center",
    },
    lemma: {
      fontFamily: typography.families.hebrewScripture,
      fontSize: 32,
      lineHeight: 46,
      color: colors.textHebrew,
      textAlign: "center",
    },
    glossChip: {
      backgroundColor: colors.primaryLight,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 5,
      maxWidth: "100%",
    },
    glossText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.bodySmall,
      color: colors.primaryDarker,
      textAlign: "center",
      lineHeight: 20,
    },
    rationale: {
      fontFamily: typography.families.latinMeaning,
      fontSize: typography.sizes.body,
      color: colors.textPrimary,
      textAlign: "center",
      lineHeight: 22,
    },
  });

export function ContextualRelatedSection({
  strong,
  verse,
  language,
}: {
  strong: string | null | undefined;
  verse: VerseRef | null;
  language: AppLanguage;
}) {
  const { t } = useTranslation();
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const styles = useMemo(() => createStyles(getColors(themeMode)), [themeMode]);
  const [loaded, setLoaded] = useState<RelatedLoad | null>(null);
  const {
    bookId,
    chapter,
    verse: verseNumber,
    key,
  } = relatedRequest(strong, verse, language);

  useEffect(
    () =>
      watchRelated(
        contextualRelationships,
        { strong, bookId, chapter, verse: verseNumber, language },
        loadRelatedGloss,
        setLoaded,
      ),
    [bookId, chapter, language, strong, verseNumber],
  );

  const entries = loadedEntries(loaded, key);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((entry) => {
        const isHebrew = entry.related.language === "hebrew";
        const reference = formatRelatedReference(entry.reference, language);
        return (
          <View key={entry.id}>
            <View style={styles.divider} />
            <View style={styles.entry}>
              <Text style={styles.label}>
                {t("wordCard.contextualRelation")}
              </Text>
              <Text style={styles.note}>
                {t("wordCard.contextualRelationScope", { reference })}
              </Text>
              <Text style={styles.label}>
                {t(
                  isHebrew
                    ? "wordCard.contextualRelationHebrew"
                    : "wordCard.contextualRelationGreek",
                )}
              </Text>
              <Text
                style={[
                  styles.lemma,
                  { writingDirection: isHebrew ? "rtl" : "ltr" },
                ]}
              >
                {entry.related.lemma}
              </Text>
              <Text style={styles.note}>
                {entry.related.strong} · {entry.related.transliteration}
              </Text>
              <View style={styles.glossChip}>
                <Text style={styles.glossText}>
                  {formatDefinitionMeaningForDisplay(entry.related.gloss)}
                </Text>
              </View>
              <Text style={styles.note}>
                {t("wordCard.contextualRelationNote")}
              </Text>
              <Text style={styles.label}>
                {t("wordCard.contextualRelationWhy")}
              </Text>
              <Text style={styles.rationale}>{entry.rationale}</Text>
              <Text style={styles.note}>{entry.credit}</Text>
              <Text style={styles.note}>{entry.locator}</Text>
              <Text style={styles.note}>
                {t("wordCard.contextualRelationReviewedBy", {
                  reviewer: entry.reviewer,
                })}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
}
