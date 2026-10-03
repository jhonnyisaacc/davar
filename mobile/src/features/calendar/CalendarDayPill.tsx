import { router } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import {
  confirmedMoadim,
  readingCalendarDay,
} from "@davar/shared/calendarPresentation";
import { useAppStore } from "@/src/store/useAppStore";
import { useTranslation } from "@/src/i18n/useTranslation";
import { useProductStyle } from "../product/ui";
import { useCalendar } from "./useCalendar";

export function CalendarDayPill() {
  const { calendar } = useCalendar();
  const everyDay = useAppStore((state) => state.showCalendarDayPill);
  const dark = useAppStore((state) => state.themeMode === "dark");
  const { t, isRTL } = useTranslation();
  const { colors } = useProductStyle();
  const color = dark ? colors.primary : colors.primaryDeep;
  const day = readingCalendarDay(calendar, everyDay);
  if (!day) return null;
  const month = day.biblical.month_id;
  const translated = month ? t(`calendar.months.${month}`) : "";
  const label = month
    ? t("calendar.dayWithMonth", {
        month: translated.startsWith("calendar.") ? month : translated,
        day: day.biblical.day!,
      })
    : t("calendar.day", { day: day.biblical.day! });
  const moadim = confirmedMoadim(day).map((id) => t(`calendar.events.${id}`));
  return (
    <Pressable
      testID="calendar-day-pill"
      accessibilityRole="button"
      accessibilityLabel={[label, ...moadim].join(" · ")}
      onPress={(event) => {
        event.stopPropagation();
        router.navigate("/(tabs)/widgets");
      }}
      style={({ pressed }) => ({
        alignSelf: "center",
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 14,
        marginBottom: 12,
        backgroundColor: colors.primary + "1F",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <CalendarDays size={14} color={color} />
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          color,
          fontSize: 12,
          writingDirection: isRTL ? "rtl" : "ltr",
        }}
      >
        {[label, ...moadim].join(" · ")}
      </Text>
    </Pressable>
  );
}
