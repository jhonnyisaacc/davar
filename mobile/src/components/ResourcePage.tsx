import type { ReactNode } from "react";
import { Stack } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "@/src/i18n/useTranslation";
import { getColors } from "@/src/theme";
import { useAppStore } from "@/src/store/useAppStore";

export function ResourceHeader({ title }: { title: string }) {
  const colors = getColors(useAppStore((state) => state.themeMode));
  const { t } = useTranslation();
  return (
    <Stack.Screen
      options={{
        title,
        headerBackTitle: t("settings.title"),
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    />
  );
}

export function ResourcePage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const colors = getColors(useAppStore((state) => state.themeMode));
  return (
    <>
      <ResourceHeader title={title} />
      <SafeAreaView
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 20 }}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
