import { useMemo } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { getColors, spacing, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";

const DONATION_CONFIG = {
  githubSponsor: "https://github.com/sponsors/jhonnyisaacc",
  kofi: "https://ko-fi.com/jhonnyisaacc",
  telegram: "https://t.me/jhonnyisaacc",
  telegramHandle: "@jhonnyisaacc",
};

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing[4],
      paddingTop: spacing[16],
      paddingBottom: spacing[12],
      justifyContent: "center",
      alignItems: "center",
    },
    centeredContent: {
      alignItems: "center",
      gap: spacing[4],
    },
    kofiButton: {
      backgroundColor: "#72a4f2",
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[6],
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing[2],
      width: 220,
    },
    githubButton: {
      backgroundColor: "#24292f",
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[6],
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing[2],
      width: 220,
    },
    buttonText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.body,
      color: "#ffffff",
      fontWeight: "600",
    },
    contactRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: spacing[2],
    },
    contactText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.body,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    telegramIconWrap: {
      marginTop: 2,
    },
  });

export default function DonateScreen() {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const openUrlSafely = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else if (__DEV__) console.warn("Can't open URL:", url);
    } catch (err) {
      if (__DEV__) console.error("Failed to open URL:", err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.centeredContent}>
            {/* Ko-fi Button */}
            <Pressable
              style={({ pressed }) => [
                styles.kofiButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => WebBrowser.openBrowserAsync(DONATION_CONFIG.kofi)}
              accessibilityRole="link"
              accessibilityLabel={t("donate.kofi")}
            >
              <FontAwesome name="coffee" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>{t("donate.kofi")}</Text>
            </Pressable>

            {/* GitHub Sponsor Button */}
            <Pressable
              style={({ pressed }) => [
                styles.githubButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => openUrlSafely(DONATION_CONFIG.githubSponsor)}
              accessibilityRole="link"
              accessibilityLabel={t("donate.githubSponsor")}
            >
              <Feather name="github" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>{t("donate.githubSponsor")}</Text>
            </Pressable>

            {/* Contact Row with Telegram icon at the beginning */}
            <Pressable
              style={styles.contactRow}
              onPress={() => openUrlSafely(DONATION_CONFIG.telegram)}
              accessibilityRole="link"
              accessibilityLabel={`${t("donate.contactPrefix")} ${t("donate.telegramLabel")} ${DONATION_CONFIG.telegramHandle}`}
            >
              <View style={styles.telegramIconWrap}>
                <FontAwesome
                  name="telegram"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
              <Text style={styles.contactText}>
                {t("donate.contactPrefix")} {t("donate.telegramLabel")}{" "}
                {DONATION_CONFIG.telegramHandle}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
