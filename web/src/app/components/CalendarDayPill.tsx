import { CalendarDays } from "lucide-react";
import {
	confirmedMoadim,
	readingCalendarPill,
} from "@davar/shared/calendarPresentation";
import { useCalendar } from "../hooks/useCalendar";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";

export function CalendarDayPill({
	language,
	showEveryDay,
	onOpenCalendar,
}: {
	language: AppLanguage;
	showEveryDay: boolean;
	onOpenCalendar: () => void;
}) {
	const calendarState = useCalendar();
	const { t } = useTranslation(language);
	const pill = readingCalendarPill(calendarState, showEveryDay);
	if (!pill) return null;
	const day = pill.kind === "day" ? pill.day : undefined;
	const month = day?.biblical.month_id;
	const dayNumber = day?.biblical.day ?? "";
	const translated = month ? t(`calendar.months.${month}`) : "";
	const label =
		pill.kind === "status"
			? t(pill.messageKey)
			: month
				? t("calendar.dayWithMonth", {
						month: translated.startsWith("calendar.") ? month : translated,
						day: dayNumber,
					})
				: t("calendar.day", { day: dayNumber });
	return (
		<button
			type="button"
			data-testid="calendar-day-pill"
			onClick={onOpenCalendar}
			className="inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs text-[var(--text-primary)] bg-[var(--accent-glow)]"
			style={{ fontFamily: "Inter, sans-serif" }}
		>
			<CalendarDays size={14} aria-hidden="true" />
			{[
				label,
				...confirmedMoadim(day).map((id) => t(`calendar.events.${id}`)),
			].join(" · ")}
		</button>
	);
}
