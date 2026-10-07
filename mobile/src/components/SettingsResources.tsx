import { router } from "expo-router";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";
import {
  GITHUB_URL,
  SETTINGS_RESOURCES,
} from "@davar/shared/settingsResources";
import { useTranslation } from "@/src/i18n/useTranslation";
import { useProductStyle } from "@/src/features/product/ui";

export function SettingsResources() {
  const { t, isRTL } = useTranslation();
  const { colors } = useProductStyle();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const items = [
    ...SETTINGS_RESOURCES.map((item) => ({
      ...item,
      open: () => router.push(item.path),
    })),
    {
      id: "github",
      label: "settings.links.github",
      open: () => void Linking.openURL(GITHUB_URL),
    },
  ];
  return (
    <View style={{ paddingTop: 20 }}>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 13,
          color: colors.textSecondary,
          textAlign: isRTL ? "right" : "left",
          marginBottom: 8,
        }}
      >
        {t("settings.links.title")}
      </Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole={item.id === "github" ? "link" : "button"}
          onPress={item.open}
          style={({ pressed }) => ({
            minHeight: 50,
            paddingVertical: 10,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              color: colors.textPrimary,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t(item.label)}
          </Text>
          {item.id === "github" ? (
            <ArrowUpRight size={18} color={colors.textSecondary} />
          ) : (
            <Chevron size={18} color={colors.textSecondary} />
          )}
        </Pressable>
      ))}
    </View>
  );
}
