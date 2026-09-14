import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getColors, radii, spacing, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: spacing[6],
      paddingTop: spacing[6],
      paddingBottom: spacing[5],
      marginBottom: spacing[5],
    },
    title: {
      fontFamily: "Jost_400Regular",
      fontSize: 30,
      color: colors.textPrimary,
      marginBottom: spacing[2],
    },
    content: {
      paddingHorizontal: spacing[6],
      paddingBottom: spacing[12],
    },
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
  });

export function SourcesScreen() {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const sources = [
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
        },
        {
          label: t("home.sources.greekTextLabel"),
          value: t("home.sources.greekTextValue"),
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
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <ScrollView>
          <View style={styles.header}>
            <Text style={styles.title}>{t("home.about.items.sources")}</Text>
          </View>

          <View style={styles.content}>
            {sources.map((category, idx) => (
              <View key={idx} style={styles.categoryCard}>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                {category.items.map((item, itemIdx) => (
                  <View key={itemIdx} style={styles.sourceItem}>
                    {item.label && (
                      <Text style={styles.sourceLabel}>{item.label}</Text>
                    )}
                    <Text style={styles.sourceValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
