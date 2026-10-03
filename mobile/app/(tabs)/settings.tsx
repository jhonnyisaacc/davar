import { Fragment, useMemo, type ReactNode } from "react";
import { router } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SettingsResources } from "@/src/components/SettingsResources";
import { PillToggle } from "@/src/components/ui/PillToggle";
import { SettingsDropdown } from "@/src/components/ui/SettingsDropdown";
import { getNavigationDockContentPadding } from "@/src/constants/navigationDock";
import { useSession } from "@/src/features/account/session";
import { getColors, spacing, typography } from "@/src/theme";
import { useAppStore } from "@/src/store/useAppStore";
import { clearStorage } from "@/src/services/storage";
import { useTranslation } from "@/src/i18n/useTranslation";
import { isGreekBesorahEnabled } from "@davar/shared/greekBesorah";
import {
  SHARED_SETTINGS_ORDER,
  canUseSeferStyle,
  isSeferStyleVisible,
  type SharedSettingId,
} from "@davar/shared/settingsOrder";

const createStyles = (
  colors: ReturnType<typeof getColors>,
  isRTL: boolean,
  dark: boolean,
) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      paddingHorizontal: spacing[5],
      paddingTop: spacing[5],
      gap: spacing[1],
    },
    title: {
      fontFamily: "Manrope_400Regular",
      fontSize: 32,
      color: colors.textPrimary,
      textAlign: isRTL ? "right" : "left",
      writingDirection: isRTL ? "rtl" : "ltr",
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 50,
      paddingVertical: 10,
      gap: spacing[3],
    },
    label: {
      flex: 1,
      fontFamily: typography.families.latinUI,
      fontSize: 15,
      color: colors.textPrimary,
      textAlign: isRTL ? "right" : "left",
      writingDirection: isRTL ? "rtl" : "ltr",
    },
    accountAction: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: spacing[1],
      maxWidth: "60%",
    },
    accountActionText: {
      flexShrink: 1,
      fontFamily: typography.families.latinUIMedium,
      fontSize: 13,
      color: dark ? colors.primaryLight : colors.primaryDeep,
      textAlign: isRTL ? "right" : "left",
      writingDirection: isRTL ? "rtl" : "ltr",
    },
    destructive: {
      color: dark ? "#FF8DA2" : "#D4183D",
    },
  });

export default function SettingsScreen() {
  const state = useAppStore(
    useShallow((store) => ({
      themeMode: store.themeMode,
      toggleThemeMode: store.toggleThemeMode,
      language: store.language,
      setLanguage: store.setLanguage,
      besorahLanguage: store.besorahLanguage,
      setBesorahLanguage: store.setBesorahLanguage,
      besorahTextVersion: store.besorahTextVersion,
      setBesorahTextVersion: store.setBesorahTextVersion,
      showFullChapter: store.showFullChapter,
      setShowFullChapter: store.setShowFullChapter,
      showCalendarDayPill: store.showCalendarDayPill,
      setShowCalendarDayPill: store.setShowCalendarDayPill,
      seferMode: store.seferMode,
      setSeferMode: store.setSeferMode,
      hebrewOnly: store.hebrewOnly,
      setHebrewOnly: store.setHebrewOnly,
      showQumran: store.showQumran,
      setShowQumran: store.setShowQumran,
      translationOnly: store.translationOnly,
      setTranslationOnly: store.setTranslationOnly,
      showNikud: store.showNikud,
      setShowNikud: store.setShowNikud,
      showCantillation: store.showCantillation,
      setShowCantillation: store.setShowCantillation,
    })),
  );
  const account = useSession((session) => session.account);
  const hasLinkedAccount = !!account?.providers.length;
  const insets = useSafeAreaInsets();
  const colors = getColors(state.themeMode);
  const { t, isRTL } = useTranslation();
  const styles = useMemo(
    () => createStyles(colors, isRTL, state.themeMode === "dark"),
    [colors, isRTL, state.themeMode],
  );
  const greekAvailable = isGreekBesorahEnabled({
    EXPO_PUBLIC_GREEK_PREVIEW_ENABLED:
      process.env.EXPO_PUBLIC_GREEK_PREVIEW_ENABLED,
  });
  const seferEnabled = canUseSeferStyle(state);
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  const handleDisabledHebrewOptionPress = () => {
    Alert.alert(
      t("settings.translationOnly.title"),
      t("settings.translationOnly.disablesHebrewFeatures"),
    );
  };

  const handleDisabledSeferPress = () => {
    Alert.alert(
      t("settings.seferStyle.warningTitle"),
      t("settings.seferStyle.warningMessage"),
    );
  };

  const toggleRow = (
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
    disabled = false,
    onDisabledPress?: () => void,
  ) => (
    <View style={styles.row}>
      <Text style={[styles.label, disabled && { opacity: 0.55 }]}>{label}</Text>
      <PillToggle
        label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onDisabledPress={onDisabledPress}
      />
    </View>
  );

  const renderSharedSetting = (id: SharedSettingId): ReactNode => {
    switch (id) {
      case "theme":
        return toggleRow(
          t("settings.theme.title"),
          state.themeMode === "dark",
          state.toggleThemeMode,
        );
      case "language":
        return (
          <View style={styles.row}>
            <Text style={styles.label}>{t("settings.language.title")}</Text>
            <SettingsDropdown
              label={t("settings.language.title")}
              value={state.language}
              onChange={state.setLanguage}
              options={[
                { label: t("languages.en"), value: "en" },
                { label: t("languages.es"), value: "es" },
                { label: t("languages.he"), value: "he" },
              ]}
            />
          </View>
        );
      case "besorahLanguage":
        if (!greekAvailable) return null;
        return (
          <View style={styles.row}>
            <Text style={styles.label}>
              {t("settings.besorahLanguage.title")}
            </Text>
            <SettingsDropdown
              label={t("settings.besorahLanguage.title")}
              value={state.besorahLanguage}
              onChange={state.setBesorahLanguage}
              options={[
                {
                  label: t("settings.besorahLanguage.hebrew"),
                  value: "hebrew",
                },
                { label: t("settings.besorahLanguage.greek"), value: "greek" },
              ]}
            />
          </View>
        );
      case "besorahTextVersion":
        if (state.besorahLanguage === "greek") return null;
        return (
          <View style={styles.row}>
            <Text style={styles.label}>
              {t("settings.besorahTextVersion.title")}
            </Text>
            <SettingsDropdown
              label={t("settings.besorahTextVersion.title")}
              value={state.besorahTextVersion}
              onChange={state.setBesorahTextVersion}
              options={[
                {
                  label: t("settings.besorahTextVersion.delitzsch"),
                  value: "delitzsch",
                },
                {
                  label: t("settings.besorahTextVersion.hutter"),
                  value: "hutter",
                },
              ]}
            />
          </View>
        );
      case "fullChapter":
        return (
          <>
            {toggleRow(
              t("settings.fullChapter.title"),
              state.showFullChapter,
              state.setShowFullChapter,
            )}
            {toggleRow(
              t("settings.translationOnly.title"),
              state.translationOnly,
              state.setTranslationOnly,
            )}
          </>
        );
      case "calendarDayPill":
        return (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.label}>
                {t("settings.calendarDayPill.title")}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t("settings.calendarDayPill.subtitle")}
              </Text>
            </View>
            <PillToggle
              label={t("settings.calendarDayPill.title")}
              value={state.showCalendarDayPill}
              onChange={state.setShowCalendarDayPill}
            />
          </View>
        );
      case "seferStyle":
        if (!isSeferStyleVisible(state.showFullChapter)) return null;
        return toggleRow(
          t("settings.seferStyle.title"),
          state.seferMode,
          state.setSeferMode,
          !seferEnabled,
          handleDisabledSeferPress,
        );
      case "hebrewOnly":
        return toggleRow(
          t("settings.hebrewOnly.title"),
          state.hebrewOnly,
          state.setHebrewOnly,
          state.translationOnly,
          handleDisabledHebrewOptionPress,
        );
      case "qumran":
        return toggleRow(
          t("settings.qumran.title"),
          state.showQumran,
          state.setShowQumran,
          state.translationOnly,
          handleDisabledHebrewOptionPress,
        );
      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  };

  const handleClearStorage = () => {
    Alert.alert(
      t("settings.clearStorage.alertTitle"),
      t("settings.clearStorage.alertMessage"),
      [
        { text: t("settings.clearStorage.cancel"), style: "cancel" },
        {
          text: t("settings.clearStorage.confirm"),
          style: "destructive",
          onPress: async () => {
            await clearStorage();
            const current = useAppStore.getState();
            current.setHebrewFontScale(1);
            current.setShowQumran(false);
            current.setShowFullChapter(false);
            current.setSeferMode(false);
            current.setShowCalendarDayPill(false);
            current.setHebrewOnly(false);
            current.setTranslationOnly(false);
            current.setLanguage("en");
            if (current.themeMode === "dark") current.toggleThemeMode();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: getNavigationDockContentPadding(insets.bottom) },
        ]}
        scrollIndicatorInsets={{
          bottom: getNavigationDockContentPadding(insets.bottom),
        }}
      >
        <Text accessibilityRole="header" style={styles.title}>
          {t("settings.title")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("settings.account.title")}, ${hasLinkedAccount ? t("settings.account.manage") : t("settings.account.signIn")}`}
          onPress={() => router.push("/account")}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
        >
          <Text style={styles.label}>{t("settings.account.title")}</Text>
          <View style={styles.accountAction}>
            <Text numberOfLines={1} style={styles.accountActionText}>
              {hasLinkedAccount
                ? account.display_name || t("settings.account.manage")
                : t("settings.account.signIn")}
            </Text>
            <Chevron
              size={16}
              color={
                state.themeMode === "dark"
                  ? colors.primaryLight
                  : colors.primaryDeep
              }
            />
          </View>
        </Pressable>
        {SHARED_SETTINGS_ORDER.map((id) => (
          <Fragment key={id}>{renderSharedSetting(id)}</Fragment>
        ))}
        {toggleRow(
          t("settings.nikud.title"),
          state.showNikud,
          state.setShowNikud,
          state.translationOnly,
          handleDisabledHebrewOptionPress,
        )}
        {toggleRow(
          t("settings.cantillation.title"),
          state.showCantillation,
          state.setShowCantillation,
          state.translationOnly,
          handleDisabledHebrewOptionPress,
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.clearStorage.title")}
          onPress={handleClearStorage}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
        >
          <Text style={[styles.label, styles.destructive]}>
            {t("settings.clearStorage.title")}
          </Text>
        </Pressable>
        <SettingsResources />
      </ScrollView>
    </SafeAreaView>
  );
}
