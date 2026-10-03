import { useEffect, useState, type ReactNode } from "react";
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
import type { CalendarCity } from "@davar/shared/calendarClient";
import type {
  CalendarDay,
  CalendarResponse,
} from "@davar/shared/productContracts";
import {
  annualMoadim,
  calendarSources,
  calendarYear,
  confirmedMoadim,
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
  const [cities, setCities] = useState<CalendarCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedCalendar, setSelectedCalendar] =
    useState<CalendarResponse | null>(null);
  const [dayBusy, setDayBusy] = useState(false);
  const [dayError, setDayError] = useState(false);
  const [annual, setAnnual] = useState<CalendarResponse | null>(null);
  const [annualBusy, setAnnualBusy] = useState(false);
  const [annualError, setAnnualError] = useState(false);
  const [annualAttempt, setAnnualAttempt] = useState(0);
  const [linkError, setLinkError] = useState(false);
  const currentScreen = !city ? "city" : screen;
  const year = calendarYear(timezone);
  const selected = offset === 0 ? calendar : selectedCalendar;
  const day = selected?.days[0];
  const moadim = confirmedMoadim(day);
  const displayMonth = (id: string) => {
    const value = t(`calendar.months.${id}`);
    return value.startsWith("calendar.") ? id.replaceAll("_", " ") : value;
  };
  const dayLabel = (value: CalendarDay) =>
    value.biblical.month_id
      ? t("calendar.dayWithMonth", {
          month: displayMonth(value.biblical.month_id),
          day: value.biblical.day!,
        })
      : t("calendar.day", { day: value.biblical.day! });
  const yearRows = annualMoadim(annual, year);

  useEffect(() => {
    if (currentScreen !== "city" || query.trim().length < 2) {
      setCities([]);
      setSearched(false);
      setSearching(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    setCities([]);
    setSearching(true);
    setSearchError(false);
    setSearched(false);
    const timer = setTimeout(() => {
      void calendarClient
        .searchCities(query)
        .then((result) => {
          if (!cancelled) {
            setCities(result);
            setSearched(true);
          }
        })
        .catch(() => {
          if (!cancelled) setSearchError(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentScreen, query]);
  useEffect(() => {
    if (!city || offset === 0) {
      setSelectedCalendar(null);
      setDayBusy(false);
      setDayError(false);
      return;
    }
    let cancelled = false;
    setSelectedCalendar(null);
    setDayBusy(true);
    setDayError(false);
    void calendarClient
      .day(offset)
      .then((result) => {
        if (!cancelled) setSelectedCalendar(result);
      })
      .catch(() => {
        if (!cancelled) setDayError(true);
      })
      .finally(() => {
        if (!cancelled) setDayBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city, offset, calendar]);
  useEffect(() => {
    if (!city || currentScreen !== "moadim") return;
    let cancelled = false;
    setAnnual(null);
    setAnnualBusy(true);
    setAnnualError(false);
    void calendarClient
      .year(year)
      .then((result) => {
        if (!cancelled) setAnnual(result);
      })
      .catch(() => {
        if (!cancelled) setAnnualError(true);
      })
      .finally(() => {
        if (!cancelled) setAnnualBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city, currentScreen, year, annualAttempt]);

  const back = () => {
    setScreen("calendar");
    setLinkError(false);
  };
  const refresh = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("calendar.refresh")}
      disabled={busy}
      onPress={() => void calendarClient.refresh()}
      style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}
    >
      <Caption accent>
        {busy ? t("calendar.loading") : t("calendar.refresh")}
      </Caption>
    </Pressable>
  );
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
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            marginVertical: 10,
            textAlign: rtl ? "right" : "left",
          }}
        >
          {t("calendar.sourcesIntroduction")}
        </Text>
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
        <Caption>{t("calendar.defaultBrowser")}</Caption>
        {linkError ? <Caption>{t("calendar.unavailable")}</Caption> : null}
        {calendar?.source?.last_synced_at ? (
          <Caption>
            {t("calendar.checked", {
              date: new Date(calendar.source.last_synced_at).toLocaleString(
                language,
              ),
            })}
          </Caption>
        ) : null}
        {calendar?.source?.review_count ? (
          <Caption>{t("calendar.review")}</Caption>
        ) : null}
      </Page>
    );

  if (currentScreen === "moadim")
    return (
      <Page title="">
        <Header title={t("calendar.moadim")} back={back} />
        <View
          style={{
            flexDirection: rtl ? "row-reverse" : "row",
            justifyContent: "space-between",
          }}
        >
          <Caption>{t("calendar.currentYear")}</Caption>
          <Caption>{year}</Caption>
        </View>
        <Caption>{t("calendar.sunsetBoundary")}</Caption>
        {annualBusy ? (
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
              <Caption accent>{t("calendar.refresh")}</Caption>
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
          <Caption>
            {day?.biblical.day == null
              ? t("calendar.awaitingMoon")
              : t("calendar.dayOfMonth")}
          </Caption>
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
            subtitle={[city?.city, city?.country].filter(Boolean).join(" · ")}
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
            subtitle={
              moadim.length
                ? moadim.map((id) => t(`calendar.events.${id}`)).join(" · ")
                : selected?.year_start_status === "confirmed"
                  ? t("calendar.noAppointment")
                  : t("calendar.awaitingYear")
            }
            onPress={() => setScreen("moadim")}
          />
          <Row
            icon={BookOpen}
            title={t("calendar.source")}
            subtitle={t("calendar.sourceSubtitle")}
            onPress={() => setScreen("sources")}
          />
        </View>
        {busy || dayBusy ? (
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
        {calendar?.source?.stale ? (
          <Caption>
            {t(
              calendar.source.last_synced_at
                ? "calendar.stale"
                : "calendar.firstUpdate",
            )}
          </Caption>
        ) : null}
        {refresh}
      </View>
    </Page>
  );
}
