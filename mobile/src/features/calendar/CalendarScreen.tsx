import { useCalendarWorkspace } from "./useCalendarWorkspace";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  Flame,
  Heart,
  MapPin,
  Megaphone,
  Moon,
  Search,
  Sprout,
  Sunset,
  Tent,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react-native";
import type { CalendarDay } from "@davar/shared/productContracts";
import {
  annualMoadim,
  calendarSources,
  calendarYear,
  confirmedMoadim,
  localSunsetClock,
  type CalendarIcon,
} from "@davar/shared/calendarPresentation";
import { calendarIsOutdated } from "@davar/shared/calendarRefresh";
import { useTranslation } from "@/src/i18n/useTranslation";
import { Page, useProductStyle } from "../product/ui";
import { calendarClient, useCalendar } from "./useCalendar";

const moedIcons: Record<CalendarIcon, LucideIcon> = {
  flame: Flame,
  wheat: Wheat,
  sprout: Sprout,
  "book-open": BookOpen,
  megaphone: Megaphone,
  heart: Heart,
  tent: Tent,
  users: Users,
};
type Screen = "calendar" | "city" | "sources" | "moadim";

function Caption({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  const { colors, rtl } = useProductStyle();
  return (
    <Text
      style={{
        fontFamily: "Inter_400Regular",
        fontSize: 12,
        lineHeight: 18,
        color: accent ? colors.primary : colors.textSecondary,
        textAlign: rtl ? "right" : "left",
        writingDirection: rtl ? "rtl" : "ltr",
      }}
    >
      {children}
    </Text>
  );
}
function Row({
  icon: Icon,
  title,
  subtitle,
  onPress,
  confirmed,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  confirmed?: boolean;
}) {
  const { colors, rtl } = useProductStyle();
  const content = (
    <>
      <Icon size={18} color={colors.primary} strokeWidth={1.7} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textPrimary,
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Caption accent={Icon === Sunset}>{subtitle}</Caption>
        ) : null}
      </View>
      {onPress ? (
        rtl ? (
          <ChevronLeft size={16} color={colors.textSecondary} />
        ) : (
          <ChevronRight size={16} color={colors.textSecondary} />
        )
      ) : confirmed ? (
        <CircleCheck size={16} color={colors.textSecondary} />
      ) : null}
    </>
  );
  const style = {
    flexDirection: rtl ? ("row-reverse" as const) : ("row" as const),
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 9,
    minHeight: 52,
    borderBottomWidth: 1,
    borderColor: colors.border,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
function Header({ title, back }: { title: string; back?: () => void }) {
  const { colors, rtl } = useProductStyle();
  const { t } = useTranslation();
  const Back = rtl ? ArrowRight : ArrowLeft;
  return (
    <View
      style={{
        flexDirection: rtl ? "row-reverse" : "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.back")}
          onPress={back}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface,
            shadowColor: colors.shadowDark,
            shadowOffset: { width: 3, height: 3 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Back size={18} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          fontFamily: "Manrope_400Regular",
          fontSize: 30,
          color: colors.textPrimary,
          textAlign: back ? (rtl ? "right" : "left") : "center",
          writingDirection: rtl ? "rtl" : "ltr",
        }}
      >
        {title}
      </Text>
    </View>
  );
}

export default function CalendarScreen() {
  const state = useCalendar();
  const { city, timezone, calendar, busy, restored, error } = state;
  const { colors, rtl, language } = useProductStyle();
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("calendar");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [annualAttempt, setAnnualAttempt] = useState(0);
  const [linkError, setLinkError] = useState(false);
  const currentScreen = !city ? "city" : screen;

  const year = calendarYear(timezone);
  const requests = useCalendarWorkspace({
    city,
    calendar,
    view: currentScreen,
    query,
    offset,
    year,
    annualAttempt,
  });
  const {
    data: cities,
    busy: searching,
    searched,
    error: searchError,
  } = requests.cities;
  const {
    data: selectedCalendar,
    busy: dayBusy,
    error: dayError,
  } = requests.day;
  const {
    data: annual,
    busy: annualBusy,
    error: annualError,
  } = requests.annual;
  const selected = offset === 0 ? calendar : selectedCalendar;
  const day = selected?.days[0];
  const moadim = confirmedMoadim(day);
  const displayMonth = (id: string) => {
    const value = t(`calendar.months.${id}`);
    return value.startsWith("calendar.") ? id.replaceAll("_", " ") : value;
  };
  const rabbinicMonth = (id: string) => t(`calendar.rabbinicMonths.${id}`);
  const dayLabel = (value: CalendarDay) =>
    value.biblical.day === null
      ? new Intl.DateTimeFormat(language, {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).format(new Date(`${value.civil_date}T12:00:00Z`))
      : value.biblical.month_id
        ? t("calendar.dayWithMonth", {
            month: displayMonth(value.biblical.month_id),
            day: value.biblical.day!,
          })
        : t("calendar.day", { day: value.biblical.day! });
  const yearRows = annualMoadim(annual, year);

  const back = () => {
    setScreen("calendar");
    setLinkError(false);
  };
  if (!restored)
    return (
      <Page title="">
        <ActivityIndicator
          accessibilityLabel={t("calendar.loading")}
          color={colors.primary}
        />
      </Page>
    );

  if (currentScreen === "city")
    return (
      <Page title="">
        <View
          style={{
            minHeight: Math.max(440, height - 190),
            justifyContent: "center",
            gap: 32,
          }}
        >
          {city ? <Header title={t("calendar.nav")} back={back} /> : null}
          <View
            style={{ gap: 14, alignItems: rtl ? "flex-end" : "flex-start" }}
          >
            <View
              style={{
                width: "100%",
                flexDirection: rtl ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <MapPin size={28} color={colors.primary} />
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  fontFamily: "Manrope_400Regular",
                  fontSize: 38,
                  lineHeight: 43,
                  color: colors.textPrimary,
                  textAlign: rtl ? "right" : "left",
                  writingDirection: rtl ? "rtl" : "ltr",
                }}
              >
                {t("calendar.chooseCity").replaceAll("\n", " ")}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                lineHeight: 23,
                color: colors.textSecondary,
                textAlign: rtl ? "right" : "left",
              }}
            >
              {t("calendar.cityExplanation")}
            </Text>
          </View>
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: rtl ? "row-reverse" : "row",
                gap: 10,
                alignItems: "center",
                height: 52,
                paddingHorizontal: 14,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
              }}
            >
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                accessibilityLabel={t("calendar.searchCity")}
                placeholder={t("calendar.searchCity")}
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                maxLength={100}
                returnKeyType="search"
                style={{
                  flex: 1,
                  minHeight: 48,
                  fontFamily: "Inter_400Regular",
                  fontSize: 15,
                  color: colors.textPrimary,
                  textAlign: rtl ? "right" : "left",
                }}
              />
              {searching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : null}
            </View>
            {cities.map((result) => (
              <Row
                key={`${result.city}/${result.country}/${result.latitude}/${result.longitude}`}
                icon={MapPin}
                title={result.city}
                subtitle={[result.state, result.country]
                  .filter(Boolean)
                  .join(", ")}
                onPress={() => {
                  calendarClient.selectCity(result);
                  setOffset(0);
                  setScreen("calendar");
                  setQuery("");
                }}
              />
            ))}
            {searched && !cities.length ? (
              <Caption>{t("calendar.noCities")}</Caption>
            ) : null}
            {searchError ? (
              <Caption>{t("calendar.searchUnavailable")}</Caption>
            ) : null}
          </View>
          <Caption>{t("calendar.cityHint")}</Caption>
        </View>
      </Page>
    );

  if (currentScreen === "sources")
    return (
      <Page title="">
        <Header title={t("calendar.sources")} back={back} />
        {calendarSources(selected, day).map((source) => (
          <View
            key={source.id}
            style={{
              paddingVertical: 12,
              gap: 12,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Row
              icon={source.id === "observation" ? BookOpen : Moon}
              title={
                source.id === "observation"
                  ? t("calendar.observationReport")
                  : source.name === "israeli_new_moon_society"
                    ? "Israeli New Moon Society"
                    : source.name
              }
              subtitle={
                source.id === "observation" && day?.observation
                  ? t("calendar.observed", {
                      date: day.observation.observed_on,
                    })
                  : t("calendar.sourceDescription")
              }
            />
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={source.url}
              onPress={() => {
                void Linking.openURL(source.url).catch(() =>
                  setLinkError(true),
                );
              }}
              style={{
                minHeight: 48,
                flexDirection: rtl ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text
                selectable
                style={{
                  flex: 1,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.primary,
                  writingDirection: "ltr",
                  textAlign: rtl ? "right" : "left",
                }}
              >
                {source.url}
              </Text>
              <ExternalLink size={18} color={colors.primary} />
            </Pressable>
          </View>
        ))}
        {!calendarSources(selected, day).length ? (
          <Caption>{t("calendar.noSources")}</Caption>
        ) : null}
        {linkError ? <Caption>{t("calendar.unavailable")}</Caption> : null}
        {calendar?.source?.last_synced_at || calendar?.source?.review_count ? (
          <Caption>
            {[
              calendar.source.review_count ? t("calendar.review") : null,
              calendar.source.last_synced_at
                ? t("calendar.checked", {
                    date: new Date(
                      calendar.source.last_synced_at,
                    ).toLocaleString(language),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </Caption>
        ) : null}
      </Page>
    );

  if (currentScreen === "moadim")
    return (
      <Page title="">
        <Header title={t("calendar.moadim")} back={back} />
        <Caption>{t("calendar.sunsetBoundary")}</Caption>
        {annualBusy || (!annual && !annualError) ? (
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel={t("calendar.loading")}
          />
        ) : null}
        {annualError ? (
          <>
            <Caption>{t("calendar.yearUnavailable")}</Caption>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAnnualAttempt((value) => value + 1)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Caption accent>{t("common.retry")}</Caption>
            </Pressable>
          </>
        ) : null}
        <View>
          {yearRows
            .filter((row) => row.days.length)
            .map((row) => (
              <Row
                key={row.id}
                icon={moedIcons[row.icon]}
                title={t(`calendar.events.${row.id}`)}
                subtitle={
                  row.days.length === 1
                    ? dayLabel(row.days[0])
                    : t("calendar.monthRange", {
                        month: displayMonth(row.days[0].biblical.month_id!),
                        first: row.days[0].biblical.day!,
                        last: row.days[row.days.length - 1].biblical.day!,
                      })
                }
              />
            ))}
        </View>
        {yearRows.some((row) => !row.days.length) ? (
          <View style={{ gap: 6 }}>
            <Caption>{t("calendar.awaitingDates")}</Caption>
            {yearRows
              .filter((row) => !row.days.length)
              .map((row) => (
                <Row
                  key={row.id}
                  icon={moedIcons[row.icon]}
                  title={t(`calendar.events.${row.id}`)}
                  subtitle={t("calendar.awaitingConfirmation")}
                />
              ))}
          </View>
        ) : null}
      </Page>
    );

  const confirmed =
    day?.month_status === "confirmed" && !!day.observation?.unaided;
  return (
    <Page title="">
      <View
        style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 20 }}
      >
        <Header title={t("calendar.title")} />
        <View
          style={{
            flexDirection: rtl ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("calendar.previousDay")}
            disabled={dayBusy}
            onPress={() => setOffset((value) => value - 1)}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {rtl ? (
              <ChevronRight size={22} color={colors.textSecondary} />
            ) : (
              <ChevronLeft size={22} color={colors.textSecondary} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOffset(0)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Caption accent>
              {offset === 0
                ? t("calendar.today")
                : day?.civil_date || t("calendar.loading")}
            </Caption>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("calendar.nextDay")}
            disabled={dayBusy}
            onPress={() => setOffset((value) => value + 1)}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {rtl ? (
              <ChevronLeft size={22} color={colors.textSecondary} />
            ) : (
              <ChevronRight size={22} color={colors.textSecondary} />
            )}
          </Pressable>
        </View>
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
          <Text
            style={{
              fontFamily: "Manrope_400Regular",
              fontSize: 72,
              lineHeight: 104,
              color: colors.textPrimary,
            }}
          >
            {day?.biblical.day ?? "—"}
          </Text>
          <Text
            style={{
              fontFamily: "Manrope_400Regular",
              fontSize: 22,
              color: colors.textPrimary,
              textAlign: "center",
              writingDirection: rtl ? "rtl" : "ltr",
            }}
          >
            {day?.biblical.day == null
              ? t("calendar.awaitingMoon")
              : day.biblical.month_id
                ? displayMonth(day.biblical.month_id)
                : t("calendar.dayOfMonth")}
          </Text>
          {day ? (
            <Caption>
              {t("calendar.rabbinicDate", {
                day: day.rabbinic.day,
                month: rabbinicMonth(day.rabbinic.month_id),
                year: day.rabbinic.year,
              })}
            </Caption>
          ) : null}
          {moadim.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => setScreen("moadim")}
              style={{
                flexDirection: rtl ? "row-reverse" : "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingVertical: 7,
                paddingHorizontal: 14,
                backgroundColor: colors.primary + "1F",
              }}
            >
              <CalendarDays size={14} color={colors.primary} />
              <Caption accent>{t(`calendar.events.${id}`)}</Caption>
            </Pressable>
          ))}
        </View>
        <View>
          <Row
            icon={Sunset}
            title={t("calendar.localSunset")}
            subtitle={[
              localSunsetClock(
                day?.sunset_at,
                selected?.timezone ?? timezone,
                language,
              ),
              city?.city,
              city?.country,
            ]
              .filter(Boolean)
              .join(" · ")}
            onPress={() => {
              setQuery("");
              setScreen("city");
            }}
          />
          <Row
            icon={Moon}
            title={
              confirmed
                ? t("calendar.moonConfirmed")
                : t("calendar.moonPending")
            }
            subtitle={
              confirmed
                ? t("calendar.sightedIsrael")
                : t("calendar.waitingIsrael")
            }
            confirmed={confirmed}
          />
          <Row
            icon={CalendarDays}
            title={t("calendar.appointedTimes")}
            subtitle={t("calendar.moadimYear")}
            onPress={() => setScreen("moadim")}
          />
          <Row
            icon={BookOpen}
            title={t("calendar.source")}
            subtitle={t("calendar.sourceSubtitle")}
            onPress={() => setScreen("sources")}
          />
        </View>
        {!day && (busy || dayBusy) ? (
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel={t("calendar.loading")}
          />
        ) : null}
        {error || dayError ? (
          <Caption>{t("calendar.unavailable")}</Caption>
        ) : null}
        {calendar && calendarIsOutdated(calendar) ? (
          <Caption>{t("calendar.cached")}</Caption>
        ) : null}
        {calendar?.source?.development_fixture ? (
          <Caption>{t("calendar.fixture")}</Caption>
        ) : null}
        {calendar?.source?.stale && calendar.source.last_synced_at ? (
          <Caption>{t("calendar.stale")}</Caption>
        ) : null}
      </View>
    </Page>
  );
}
