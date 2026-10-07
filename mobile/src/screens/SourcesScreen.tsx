import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ResourcePage } from "@/src/components/ResourcePage";

import { getColors, radii, spacing, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";
import { GreekAttribution } from "@/src/components/GreekAttribution";

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    categoryCard: {
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing[5],
      marginBottom: spacing[4],
    },
    categoryTitle: {
      fontFamily: typography.families.latinUIBold,
      fontSize: typography.sizes.h3,
      color: colors.textPrimary,
      marginBottom: spacing[3],
    },
    sourceItem: {
      marginBottom: spacing[3],
    },
    sourceLabel: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.body,
      color: colors.textSecondary,
      marginBottom: spacing[1],
    },
    sourceValue: {
      fontFamily: "Arimo_400Regular",
      fontSize: typography.sizes.body,
      color: colors.textPrimary,
      lineHeight: 24,
    },
    sourceNote: {
      fontFamily: "Arimo_400Regular",
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: spacing[2],
    },
  });

export function SourcesScreen() {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, isRTL } = useTranslation();

  const sources: {
    title: string;
    items: { label?: string; value: string; note?: string }[];
  }[] = [
    {
      title: "Tanaj",
      items: [
        {
          label: t("home.sources.hebrewTextLabel"),
          value: t("home.sources.hebrewTextValue"),
        },
      ],
    },
    {
      title: "Besorah",
      items: [
        {
          label: t("home.sources.besorahLabel"),
          value: t("home.sources.besorahValue"),
          note: t("verse.besorahDisclaimer.short"),
        },
        {
          label: t("home.sources.greekTextLabel"),
          value: t("home.sources.greekTextValue"),
        },
        {
          label: t("home.sources.greekTagsLabel"),
          value: t("home.sources.greekTagsValue"),
        },
        {
          label: t("home.sources.greekLexiconLabel"),
          value: t("home.sources.greekLexiconValue"),
        },
      ],
    },
    {
      title: t("home.sources.spanishTranslationLabel"),
      items: [
        {
          label: undefined,
          value: t("home.sources.spanishTranslationValue"),
        },
      ],
    },
    {
      title: t("home.sources.englishTranslationLabel"),
      items: [
        {
          label: undefined,
          value: t("home.sources.englishTranslationValue"),
        },
      ],
    },
    {
      title: t("home.sources.dictionaryLabel"),
      items: [
        {
          label: undefined,
          value: `${t("home.sources.dictionaryValue")}${t("home.sources.dictionaryNote")}`,
        },
      ],
    },
  ];

  return (
    <ResourcePage title={t("settings.links.textSources")}>
      {sources.map((category, idx) => (
        <View key={idx} style={styles.categoryCard}>
          <Text
            style={[
              styles.categoryTitle,
              { textAlign: isRTL ? "right" : "left" },
            ]}
          >
            {category.title}
          </Text>
          {category.items.map((item, itemIdx) => (
            <View key={itemIdx} style={styles.sourceItem}>
              {item.label && (
                <Text
                  style={[
                    styles.sourceLabel,
                    { textAlign: isRTL ? "right" : "left" },
                  ]}
                >
                  {item.label}
                </Text>
              )}
              <Text
                style={[
                  styles.sourceValue,
                  {
                    textAlign: isRTL ? "right" : "left",
                    writingDirection: isRTL ? "rtl" : "ltr",
                  },
                ]}
              >
                {item.value}
              </Text>
              {item.note && (
                <Text
                  style={[
                    styles.sourceNote,
                    {
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: isRTL ? "rtl" : "ltr",
                    },
                  ]}
                >
                  {item.note}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
      <View style={styles.categoryCard}>
        <GreekAttribution
          titleColor={colors.textPrimary}
          mutedColor={colors.textSecondary}
        />
      </View>
    </ResourcePage>
  );
}
