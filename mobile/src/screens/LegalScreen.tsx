import { ResourceHeader } from "@/src/components/ResourcePage";
import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

import { getColors, spacing, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { getLegalDoc, type LegalKind } from "../../../locales/legalContent";
import { useTranslation } from "@/src/i18n/useTranslation";

interface LegalScreenProps {
  kind: LegalKind;
}

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
    subtitle: {
      fontFamily: typography.families.latinMeaning,
      fontSize: typography.sizes.bodySmall,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      gap: spacing[2],
      marginBottom: spacing[4],
    },
    metaLabel: {
      fontFamily: "Jost_400Regular",
      fontSize: 11,
      lineHeight: typography.sizes.bodySmall,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.textSecondary,
    },
    metaValue: {
      fontFamily: typography.families.latinUISemiBold,
      fontSize: 11,
      lineHeight: typography.sizes.bodySmall,
      color: colors.textPrimary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: spacing[5],
    },
    content: {
      paddingHorizontal: spacing[6],
      paddingBottom: spacing[12],
    },
    status: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.bodySmall,
      color: colors.textSecondary,
      textAlign: "center",
      paddingVertical: spacing[6],
    },
    card: {
      borderRadius: 0,
      backgroundColor: "transparent",
      padding: 0,
      borderWidth: 0,
      borderColor: "transparent",
    },
  });

export function LegalScreen({ kind }: LegalScreenProps) {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const language = useAppStore((state: AppState) => state.language);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const doc = useMemo(() => getLegalDoc(kind, language), [kind, language]);
  const { t } = useTranslation();
  const markdownStyles = useMemo(
    () => ({
      body: {
        textAlign: language === "he" ? ("right" as const) : ("left" as const),
        writingDirection:
          language === "he" ? ("rtl" as const) : ("ltr" as const),
        fontFamily: "Arimo_400Regular",
        fontSize: typography.sizes.body,
        lineHeight: 26,
        color: colors.textPrimary,
      },
      heading1: {
        fontFamily: "Jost_400Regular",
        fontSize: 24,
        color: colors.textPrimary,
        marginTop: spacing[6],
        marginBottom: spacing[2],
      },
      heading2: {
        fontFamily: "Jost_400Regular",
        fontSize: 20,
        color: colors.textPrimary,
        marginTop: spacing[5],
        marginBottom: spacing[2],
      },
      heading3: {
        fontFamily: "Jost_400Regular",
        fontSize: 18,
        color: colors.textPrimary,
        marginTop: spacing[4],
        marginBottom: spacing[2],
      },
      paragraph: {
        marginBottom: spacing[3],
      },
      bullet_list: {
        marginVertical: spacing[2],
      },
      list_item: {
        marginBottom: spacing[2],
      },
      link: {
        color: colors.accentCopper,
        textDecorationLine: "underline" as const,
      },
      table: {
        borderWidth: 1,
        borderColor: themeMode === "light" ? "#d0d0d0" : colors.border,
        marginVertical: spacing[3],
      },
      th: {
        borderWidth: 1,
        borderColor: themeMode === "light" ? "#d0d0d0" : colors.border,
        padding: spacing[2],
      },
      td: {
        borderWidth: 1,
        borderColor: themeMode === "light" ? "#d0d0d0" : colors.border,
        padding: spacing[2],
      },
    }),
    [colors, themeMode, language],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ResourceHeader title={t(`settings.links.${kind}`)} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{doc.title}</Text>
            {doc.lastUpdated && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t("legal.lastUpdated")}</Text>
                <Text style={styles.metaValue}>{doc.lastUpdated}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Markdown
              style={markdownStyles}
              onLinkPress={(url) => {
                void Linking.openURL(url);
                return false;
              }}
            >
              {doc.body}
            </Markdown>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
