import {
	annualMoadim,
	type CalendarIcon,
	calendarSources,
	calendarYear,
	confirmedMoadim,
} from "@davar/shared/calendarPresentation";
import { calendarIsOutdated } from "@davar/shared/calendarRefresh";
import type { CalendarDay } from "@davar/shared/productContracts";
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
	type LucideIcon,
	MapPin,
	Megaphone,
	Moon,
	Search,
	Sprout,
	Sunset,
	Tent,
	Users,
	Wheat,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { calendarClient, useCalendar } from "../hooks/useCalendar";
import { useCalendarWorkspace } from "../hooks/useCalendarWorkspace";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";

const icons: Record<CalendarIcon, LucideIcon> = {
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
function Caption({ children }: { children: ReactNode }) {
	return (
		<p className="text-xs leading-[18px] text-[var(--text-secondary)]">
			{children}
		</p>
	);
}
function Row({
	icon: Icon,
	title,
	subtitle,
	onClick,
	confirmed,
}: {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	onClick?: () => void;
	confirmed?: boolean;
}) {
	const content = (
		<>
			<Icon
				size={18}
				strokeWidth={1.7}
				className="shrink-0 text-[var(--accent-deep)]"
				aria-hidden="true"
			/>
			<span className="flex min-w-0 flex-1 flex-col gap-[3px] text-start">
				<span className="text-sm font-medium">{title}</span>
				{subtitle ? (
					<span className="text-xs leading-[18px] text-[var(--text-secondary)]">
						{subtitle}
					</span>
				) : null}
			</span>
			{onClick ? (
				<ChevronRight
					size={16}
					className="shrink-0 text-[var(--text-secondary)] rtl:rotate-180"
					aria-hidden="true"
				/>
			) : confirmed ? (
				<CircleCheck
					size={16}
					className="shrink-0 text-[var(--text-secondary)]"
					aria-hidden="true"
				/>
			) : null}
		</>
	);
	const className =
		"flex w-full min-h-[52px] items-center gap-3 border-b border-[var(--border)] py-[9px] text-[var(--text-primary)]";
	return onClick ? (
		<button
			type="button"
			onClick={onClick}
			className={
				className +
				" transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
			}
		>
			{content}
		</button>
	) : (
		<div className={className}>{content}</div>
	);
}

export function CalendarPanel({ language }: { language: AppLanguage }) {
	const { city, timezone, calendar, restored, busy, error } = useCalendar();
	const { t, isRTL } = useTranslation(language);
	const [screen, setScreen] = useState<Screen>("calendar");
	const [query, setQuery] = useState("");
	const [offset, setOffset] = useState(0);
	const [annualAttempt, setAnnualAttempt] = useState(0);
	const view = !city ? "city" : screen;
	const year = calendarYear(timezone);
	const requests = useCalendarWorkspace({
		city,
		calendar,
		view: view,
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
	const { data: selected, busy: dayBusy, error: dayError } = requests.day;
	const {
		data: annual,
		busy: annualBusy,
		error: annualError,
	} = requests.annual;
	const current = offset === 0 ? calendar : selected;
	const day = current?.days[0];
	const moadim = confirmedMoadim(day);

	const rows = annualMoadim(annual, year);
	const monthLabel = (id: string) => {
		const value = t(`calendar.months.${id}`);
		return value.startsWith("calendar.") ? id.replaceAll("_", " ") : value;
	};
	const dayLabel = (value: CalendarDay) =>
		value.biblical.day === null
			? new Intl.DateTimeFormat(language, {
					day: "numeric",
					month: "long",
					timeZone: "UTC",
				}).format(new Date(`${value.civil_date}T12:00:00Z`))
			: value.biblical.month_id
				? t("calendar.dayWithMonth", {
						month: monthLabel(value.biblical.month_id),
						day: value.biblical.day!,
					})
				: t("calendar.day", { day: value.biblical.day! });
	const back = () => setScreen("calendar");
	const header = (title: string, canGoBack = true) => (
		<header className="flex items-center gap-3">
			{canGoBack ? (
				<button
					type="button"
					onClick={back}
					aria-label={t("calendar.back")}
					className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--neomorph-bg)] shadow-[3px_3px_6px_var(--neomorph-shadow-dark),-3px_-3px_6px_var(--neomorph-shadow-light)]"
				>
					{isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
				</button>
			) : null}
			<h1
				className={`flex-1 text-[30px] leading-[1.45] ${canGoBack ? "text-start" : "text-center"}`}
				style={{ fontFamily: "Manrope, sans-serif", fontWeight: 400 }}
			>
				{title}
			</h1>
		</header>
	);

	const moedRow = (row: (typeof rows)[number]) => (
		<Row
			key={row.id}
			icon={icons[row.icon]}
			title={t(`calendar.events.${row.id}`)}
			subtitle={
				!row.days.length
					? t("calendar.awaitingConfirmation")
					: row.days.length === 1
						? dayLabel(row.days[0])
						: t("calendar.monthRange", {
								month: monthLabel(row.days[0].biblical.month_id!),
								first: row.days[0].biblical.day!,
								last: row.days[row.days.length - 1].biblical.day!,
							})
			}
		/>
	);
	let content: ReactNode;
	if (!restored) content = <p role="status">{t("calendar.loading")}</p>;
	else if (view === "city")
		content = (
			<div className="flex min-h-[65vh] flex-col justify-center gap-8">
				{city ? header(t("calendar.nav")) : null}
				<div className="space-y-3.5">
					<div className="flex items-center gap-3">
						<MapPin
							size={28}
							className="shrink-0 text-[var(--accent-deep)]"
							aria-hidden="true"
						/>
						<h1
							className="min-w-0 flex-1 text-[38px] leading-[1.12]"
							style={{ fontFamily: "Manrope, sans-serif" }}
						>
							{t("calendar.chooseCity").replaceAll("\n", " ")}
						</h1>
					</div>
					<p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
						{t("calendar.cityExplanation")}
					</p>
				</div>
				<div className="space-y-3">
					<div className="flex h-[52px] items-center gap-2.5 rounded-xl border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)] px-3.5">
						<Search
							size={18}
							className="shrink-0 text-[var(--text-secondary)]"
							aria-hidden="true"
						/>
						<input
							aria-label={t("calendar.searchCity")}
							placeholder={t("calendar.searchCity")}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							maxLength={100}
							autoComplete="off"
							className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
						/>
					</div>
					{searching ? (
						<p role="status" className="text-xs">
							{t("calendar.loading")}
						</p>
					) : null}
					{cities.map((result) => (
						<Row
							key={`${result.city}/${result.country}/${result.latitude}/${result.longitude}`}
							icon={MapPin}
							title={result.city}
							subtitle={[result.state, result.country]
								.filter(Boolean)
								.join(", ")}
							onClick={() => {
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
						<p role="status">{t("calendar.searchUnavailable")}</p>
					) : null}
				</div>
				<Caption>{t("calendar.cityHint")}</Caption>
			</div>
		);
	else if (view === "sources")
		content = (
			<>
				{header(t("calendar.sources"))}
				{calendarSources(current, day).map((source) => (
					<section
						key={source.id}
						className="space-y-3 border-b border-[var(--border)] pb-5"
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
						<a
							href={source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex min-h-12 items-center gap-3 text-[13px] text-[var(--accent-deep)]"
						>
							<span dir="ltr" className="min-w-0 flex-1 break-all">
								{source.url}
							</span>
							<ExternalLink size={18} aria-hidden="true" />
						</a>
					</section>
				))}
				{!calendarSources(current, day).length ? (
					<Caption>{t("calendar.noSources")}</Caption>
				) : null}
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
			</>
		);
	else if (view === "moadim")
		content = (
			<>
				{header(t("calendar.moadim"))}
				<Caption>{t("calendar.sunsetBoundary")}</Caption>
				{annualBusy || (!annual && !annualError) ? (
					<p role="status">{t("calendar.loading")}</p>
				) : null}
				{annualError ? (
					<div role="status">
						<Caption>{t("calendar.yearUnavailable")}</Caption>
						<button
							type="button"
							onClick={() => setAnnualAttempt((value) => value + 1)}
							className="min-h-11 text-sm text-[var(--accent-deep)]"
						>
							{t("common.retry")}
						</button>
					</div>
				) : null}
				<div>{rows.filter((row) => row.days.length).map(moedRow)}</div>
				{rows.some((row) => !row.days.length) ? (
					<div className="space-y-1.5">
						<Caption>{t("calendar.awaitingDates")}</Caption>
						{rows.filter((row) => !row.days.length).map(moedRow)}
					</div>
				) : null}
			</>
		);
	else {
		const confirmed =
			day?.month_status === "confirmed" && !!day.observation?.unaided;
		content = (
			<>
				{header(t("calendar.title"), false)}
				<div className="flex items-center justify-between">
					<button
						type="button"
						aria-label={t("calendar.previousDay")}
						disabled={dayBusy}
						onClick={() => setOffset((value) => value - 1)}
						className="flex size-11 items-center justify-center text-[var(--text-secondary)]"
					>
						{isRTL ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
					</button>
					<button
						type="button"
						onClick={() => setOffset(0)}
						className="min-h-11 text-sm text-[var(--accent-deep)]"
					>
						{offset === 0
							? t("calendar.today")
							: day?.civil_date || t("calendar.loading")}
					</button>
					<button
						type="button"
						aria-label={t("calendar.nextDay")}
						disabled={dayBusy}
						onClick={() => setOffset((value) => value + 1)}
						className="flex size-11 items-center justify-center text-[var(--text-secondary)]"
					>
						{isRTL ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
					</button>
				</div>
				<div className="flex flex-col items-center gap-2 py-3">
					<p
						className="text-[72px] leading-[104px]"
						style={{ fontFamily: "Manrope, sans-serif" }}
					>
						{day?.biblical.day ?? "—"}
					</p>
					<p className="text-xl text-[var(--text-primary)]">
						{day?.biblical.day == null
							? t("calendar.awaitingMoon")
							: day.biblical.month_id
								? monthLabel(day.biblical.month_id)
								: t("calendar.dayOfMonth")}
					</p>
					{day ? (
						<Caption>
							{t("calendar.rabbinicDate", {
								day: day.rabbinic.day,
								month: t(`calendar.rabbinicMonths.${day.rabbinic.month_id}`),
								year: day.rabbinic.year,
							})}
						</Caption>
					) : null}
					{moadim.map((id) => (
						<button
							key={id}
							type="button"
							onClick={() => setScreen("moadim")}
							className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-glow)] px-3.5 py-2 text-xs text-[var(--accent-deep)]"
						>
							<CalendarDays size={14} />
							{t(`calendar.events.${id}`)}
						</button>
					))}
				</div>
				<div>
					<Row
						icon={Sunset}
						title={t("calendar.localSunset")}
						subtitle={[city!.city, city!.country].filter(Boolean).join(", ")}
						onClick={() => {
							setQuery("");
							setScreen("city");
						}}
					/>
					<Row
						icon={Moon}
						title={t(
							confirmed ? "calendar.moonConfirmed" : "calendar.moonPending",
						)}
						subtitle={t(
							confirmed ? "calendar.sightedIsrael" : "calendar.waitingIsrael",
						)}
						confirmed={confirmed}
					/>
					<Row
						icon={CalendarDays}
						title={t("calendar.appointedTimes")}
						subtitle={t("calendar.moadimYear")}
						onClick={() => setScreen("moadim")}
					/>
					<Row
						icon={BookOpen}
						title={t("calendar.source")}
						subtitle={t("calendar.sourceSubtitle")}
						onClick={() => setScreen("sources")}
					/>
				</div>
				{busy || dayBusy ? <p role="status">{t("calendar.loading")}</p> : null}
				{error || dayError ? (
					<p role="status">{t("calendar.unavailable")}</p>
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
			</>
		);
	}
	return (
		<main
			dir={isRTL ? "rtl" : "ltr"}
			className="mx-auto flex w-full max-w-[420px] flex-col gap-5 px-6 pb-28 text-[var(--text-primary)]"
			style={{ fontFamily: "Inter, sans-serif" }}
		>
			{content}
		</main>
	);
}
