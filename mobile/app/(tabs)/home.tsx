import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { AnimatedCircularProgress } from "react-native-circular-progress";
import { AppIcon } from "@/src/components/ui/AppIcon";
import { getColors, radii, spacing, typography } from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import type { IconKey } from "@/src/constants/icons";
import {
  downloadAllForOffline,
  getAllLocalBundleVersions,
} from "@/src/services/offlineSync";
import { clearAllOfflineData } from "@/src/services/database";
import {
  loadCodepushCount,
  loadLastSeenUpdateId,
  saveCodepushCount,
  saveLastSeenUpdateId,
} from "@/src/services/storage";
import {
  useTranslation,
  getSupportTelegramUrl,
} from "@/src/i18n/useTranslation";
import { GreekAttribution } from "@/src/components/GreekAttribution";

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
      paddingHorizontal: spacing[6],
      paddingTop: spacing[6],
      paddingBottom: spacing[12],
      justifyContent: "center",
    },
    calendarCard: {
      borderRadius: radii.xl,
      borderWidth: 2,
      borderColor: colors.primary,
      padding: spacing[5],
      backgroundColor: colors.surface,
    },
    calendarBadge: {
      alignSelf: "flex-start",
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      marginBottom: spacing[4],
    },
    calendarBadgeText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.bodySmall,
      color: colors.textSecondary,
    },
    calendarTitle: {
      fontFamily: typography.families.latinUIBold,
      fontSize: 70,
      color: colors.textPrimary,
      marginBottom: spacing[4],
    },
    dateRow: {
      flexDirection: "row",
      gap: spacing[3],
    },
    dateCard: {
      flex: 1,
      height: 120,
      borderRadius: radii.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceLightest,
    },
    dateCardActive: {
      backgroundColor: colors.primary,
    },
    dateNumber: {
      fontFamily: typography.families.latinUIBold,
      fontSize: typography.sizes.h2,
      color: colors.textPrimary,
    },
    dateNumberActive: {
      color: colors.background,
    },
    dateLabel: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.bodySmall,
      color: colors.textSecondary,
      marginTop: spacing[1],
    },
    dateLabelActive: {
      color: colors.background,
    },
    datePip: {
      width: 20,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.background,
      marginTop: spacing[2],
    },
    actionCard: {
      borderRadius: radii.xl,
      padding: spacing[5],
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing[4],
    },
    actionPrimary: {
      backgroundColor: colors.secondary,
    },
    actionSecondary: {
      backgroundColor: colors.primaryDarker,
    },
    actionTitle: {
      fontFamily: typography.families.latinUIBold,
      fontSize: typography.sizes.h3,
      color: colors.background,
    },
    actionTitleDark: {
      color: colors.textTertiary,
    },
    actionSubtitle: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.bodySmall,
      color: colors.background,
      opacity: 0.85,
      marginTop: spacing[2],
    },
    actionSubtitleDark: {
      color: colors.textTertiary,
      opacity: 1,
    },
    actionIcon: {
      color: colors.background,
    },
    actionIconDark: {
      color: colors.textTertiary,
    },
    downloadRowPressed: {
      opacity: 0.85,
    },
    downloadStatus: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    aboutCard: {
      borderRadius: radii.xl,
      padding: spacing[5],
      backgroundColor: colors.aboutBackground,
      marginTop: spacing[4],
    },
    aboutTitle: {
      fontFamily: typography.families.latinUIBold,
      fontSize: typography.sizes.h3,
      color: "#FFFFFF",
      marginBottom: spacing[4],
    },
    aboutGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing[3],
    },
    aboutPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderRadius: radii.full,
      borderWidth: 0,
      backgroundColor: "#6B6B6B",
    },
    aboutPillInteractive: {
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.12)",
    },
    aboutPillPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    aboutText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: typography.sizes.bodySmall,
      color: "#E0E0E0",
    },
    versionMetaContainer: {
      alignItems: "center",
      marginTop: spacing[5],
      gap: spacing[1],
    },
    versionMetaText: {
      fontFamily: typography.families.latinUIMedium,
      fontSize: 11,
      color: colors.textSecondary,
      opacity: 0.7,
    },
    attributionCard: {
      borderRadius: radii.xl,
      padding: spacing[5],
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing[4],
    },
  });

export default function HomeScreen() {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const offlineStatus = useAppStore((state: AppState) => state.offlineStatus);
  const offlineUpdateAvailable = useAppStore(
    (state: AppState) => state.offlineUpdateAvailable,
  );
  const downloadProgress = useAppStore(
    (state: AppState) => state.downloadProgress,
  );
  const setOfflineStatus = useAppStore(
    (state: AppState) => state.setOfflineStatus,
  );
  const setDownloadProgress = useAppStore(
    (state: AppState) => state.setDownloadProgress,
  );
  const setLocalBundleVersions = useAppStore(
    (state: AppState) => state.setLocalBundleVersions,
  );
  const setOfflineUpdateAvailable = useAppStore(
    (state: AppState) => state.setOfflineUpdateAvailable,
  );

  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, language } = useTranslation();
  const router = useRouter();
  const [codepushCount, setCodepushCount] = useState(0);
  const [codepushVersion, setCodepushVersion] = useState("embedded");

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "1.0.0";
  const buildNumber = Constants.nativeBuildVersion ?? "dev";
  const runtimeVersion = Updates.runtimeVersion ?? "embedded";
  const updateChannel = Updates.channel ?? "none";
  const launchSource = Updates.isEmbeddedLaunch ? "embedded" : "downloaded";

  useEffect(() => {
    let isMounted = true;

    const syncCodepushMetadata = async () => {
      try {
        const currentUpdateId = Updates.updateId ?? "embedded";
        const shortVersion =
          currentUpdateId === "embedded"
            ? "embedded"
            : currentUpdateId.slice(0, 8);

        const previousCount = await loadCodepushCount();
        const lastSeenUpdateId = await loadLastSeenUpdateId();

        let nextCount = previousCount;

        if (
          currentUpdateId !== "embedded" &&
          currentUpdateId !== lastSeenUpdateId
        ) {
          nextCount = previousCount + 1;
          await saveCodepushCount(nextCount);
          await saveLastSeenUpdateId(currentUpdateId);
        } else if (currentUpdateId === "embedded" && !lastSeenUpdateId) {
          await saveLastSeenUpdateId(currentUpdateId);
        }

        if (!isMounted) {
          return;
        }

        setCodepushCount(nextCount);
        setCodepushVersion(shortVersion);
      } catch (error) {
        console.error("Failed to sync codepush metadata:", error);
      }
    };

    void syncCodepushMetadata();

    return () => {
      isMounted = false;
    };
  }, []);

  const openUrlSafely = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else console.warn("Can't open URL:", url);
    } catch (err) {
      console.error("Failed to open URL:", err);
    }
  };

  // Compute subtitle text based on offline status
  const subtitleText = useMemo(() => {
    if (offlineStatus === "downloading") {
      if (!downloadProgress) {
        return t("home.download.downloading", {
          stage: t("home.download.stages.hebrew"),
          current: "0",
          total: "4",
        });
      }
      const stageKeys: Record<string, string> = {
        hebrew: t("home.download.stages.hebrew"),
        translation: t("home.download.stages.translation"),
        dictionary: t("home.download.stages.dictionary"),
        dss: t("home.download.stages.dss"),
      };
      return t("home.download.downloading", {
        stage: stageKeys[downloadProgress.stage] ?? downloadProgress.stage,
        current: String(downloadProgress.current),
        total: String(downloadProgress.total),
      });
    }
    if (offlineUpdateAvailable) return t("home.download.updateAvailable");
    if (offlineStatus === "ready") return t("home.download.ready");
    return t("home.download.idle");
  }, [offlineStatus, offlineUpdateAvailable, downloadProgress, t]);

  const handleDownloadPress = useCallback(async () => {
    if (offlineStatus === "downloading") return;

    const downloadLanguage =
      language === "es" ? ("es" as const) : ("en" as const);

    setOfflineStatus("downloading");
    setDownloadProgress(null);

    try {
      await downloadAllForOffline(downloadLanguage, (progress) => {
        setDownloadProgress(progress);
      });
      const versions = await getAllLocalBundleVersions();
      setLocalBundleVersions(versions);
      setOfflineStatus("ready");
      setOfflineUpdateAvailable(false);
    } catch {
      // If some bundles succeeded before the failure, keep "ready" if we have any data.
      try {
        const versions = await getAllLocalBundleVersions();
        setLocalBundleVersions(versions);
        setOfflineStatus(Object.keys(versions).length > 0 ? "ready" : "idle");
      } catch {
        setOfflineStatus("idle");
      }
    } finally {
      setDownloadProgress(null);
    }
  }, [
    offlineStatus,
    language,
    setOfflineStatus,
    setDownloadProgress,
    setLocalBundleVersions,
    setOfflineUpdateAvailable,
  ]);

  const handleDeleteOfflineData = useCallback(() => {
    Alert.alert(
      t("home.download.deleteConfirmTitle"),
      t("home.download.deleteConfirmMessage"),
      [
        {
          text: t("home.download.deleteConfirmCancel"),
          style: "cancel",
        },
        {
          text: t("home.download.deleteConfirmOk"),
          style: "destructive",
          onPress: async () => {
            try {
              await clearAllOfflineData();
              setOfflineStatus("idle");
              setLocalBundleVersions({});
              setOfflineUpdateAvailable(false);
            } catch (error) {
              console.error("Failed to clear offline data:", error);
            }
          },
        },
      ],
    );
  }, [t, setOfflineStatus, setLocalBundleVersions, setOfflineUpdateAvailable]);

  // Download button icon
  const downloadIcon: IconKey = offlineUpdateAvailable
    ? "download"
    : offlineStatus === "ready"
      ? "download-done"
      : "download";

  const hasOfflineData = offlineStatus === "ready";
  const shouldOfferDelete = hasOfflineData && !offlineUpdateAvailable;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            onPress={
              shouldOfferDelete ? handleDeleteOfflineData : handleDownloadPress
            }
            style={({ pressed }) => [
              styles.actionCard,
              styles.actionPrimary,
              pressed && styles.downloadRowPressed,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.actionTitle,
                  themeMode === "dark" && styles.actionTitleDark,
                ]}
              >
                {shouldOfferDelete
                  ? t("home.download.delete")
                  : t("home.download.title")}
              </Text>
              <Text
                style={[
                  styles.actionSubtitle,
                  themeMode === "dark" && styles.actionSubtitleDark,
                ]}
              >
                {subtitleText}
              </Text>
            </View>
            <View style={styles.downloadStatus}>
              {offlineStatus === "downloading" && downloadProgress ? (
                <AnimatedCircularProgress
                  size={24}
                  width={2.5}
                  fill={
                    (downloadProgress.current / downloadProgress.total) * 100
                  }
                  tintColor={
                    themeMode === "dark"
                      ? styles.actionIconDark.color
                      : styles.actionIcon.color
                  }
                  backgroundColor={
                    themeMode === "dark"
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.12)"
                  }
                  rotation={0}
                  lineCap="round"
                  duration={350}
                />
              ) : (
                <AppIcon
                  name={downloadIcon}
                  size={24}
                  color={
                    themeMode === "dark"
                      ? styles.actionIconDark.color
                      : styles.actionIcon.color
                  }
                />
              )}
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.actionSecondary,
              pressed && styles.downloadRowPressed,
            ]}
            onPress={() => router.push("/donate")}
          >
            <View>
              <Text
                style={[
                  styles.actionTitle,
                  themeMode === "dark" && styles.actionTitleDark,
                ]}
              >
                {t("home.donate.title")}
              </Text>
              <Text
                style={[
                  styles.actionSubtitle,
                  themeMode === "dark" && styles.actionSubtitleDark,
                ]}
              >
                {t("home.donate.subtitle")}
              </Text>
            </View>
            <AppIcon
              name="favorite"
              size={24}
              color={
                themeMode === "dark"
                  ? styles.actionIconDark.color
                  : styles.actionIcon.color
              }
            />
          </Pressable>

          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>{t("home.about.title")}</Text>
            <View style={styles.aboutGrid}>
              {(
                [
                  {
                    label: t("home.about.items.sources"),
                    icon: "sources",
                    onPress: () => router.push("/sources"),
                  },
                  {
                    label: t("home.about.items.terms"),
                    icon: "file",
                    onPress: () => router.push("/terms"),
                  },
                  {
                    label: t("home.about.items.privacy"),
                    icon: "shield",
                    onPress: () => router.push("/privacy"),
                  },
                  {
                    label: t("home.about.items.support"),
                    icon: "chat",
                    onPress: () =>
                      void openUrlSafely(getSupportTelegramUrl(language)),
                  },
                  {
                    label: t("home.about.items.bug"),
                    icon: "bug",
                    onPress: () =>
                      void openUrlSafely(
                        "https://github.com/jhonnyisaacc/davar/issues/new",
                      ),
                  },
                  {
                    label: t("home.about.items.github"),
                    icon: "github",
                    onPress: () =>
                      void openUrlSafely("https://github.com/jhonnyisaacc/davar"),
                  },
                  {
                    label: t("home.about.items.feedback"),
                    icon: "feedback",
                    onPress: () =>
                      void openUrlSafely(getSupportTelegramUrl(language)),
                  },
                ] as { label: string; icon: IconKey; onPress?: () => void }[]
              ).map((item) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                  style={({ pressed }) => [
                    styles.aboutPill,
                    item.onPress && styles.aboutPillInteractive,
                    pressed && item.onPress && styles.aboutPillPressed,
                  ]}
                >
                  <AppIcon name={item.icon} size={16} color="#E0E0E0" />
                  <Text style={styles.aboutText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.attributionCard}>
            <GreekAttribution
              titleColor={colors.textPrimary}
              mutedColor={colors.textSecondary}
            />
          </View>

          <View style={styles.versionMetaContainer}>
            <Text style={styles.versionMetaText}>
              {`App v${appVersion} • Build ${buildNumber} • OTA ${codepushCount}`}
            </Text>
            <Text style={styles.versionMetaText}>
              {`Update ${codepushVersion} • ${launchSource} • Channel ${updateChannel}`}
            </Text>
            <Text style={styles.versionMetaText}>
              {`Runtime ${runtimeVersion}`}
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
