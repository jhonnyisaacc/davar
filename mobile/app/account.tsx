import { Stack } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccountControls } from "@/src/features/account/AccountControls";
import { useSession } from "@/src/features/account/session";
import { useTranslation } from "@/src/i18n/useTranslation";
import { useAppStore } from "@/src/store/useAppStore";
import { getColors, spacing } from "@/src/theme";

export default function AccountScreen() {
  const colors = getColors(useAppStore((state) => state.themeMode));
  const hasLinkedAccount = useSession(
    (session) => !!session.account?.providers.length,
  );
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: hasLinkedAccount
            ? t("settings.account.title")
            : t("settings.account.signIn"),
          headerBackTitle: t("settings.title"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: spacing[5],
            paddingBottom: spacing[8],
          }}
        >
          <AccountControls />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
