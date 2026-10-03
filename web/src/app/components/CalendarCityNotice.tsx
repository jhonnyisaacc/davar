import { useCalendar } from "../hooks/useCalendar";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";

export function CalendarCityNotice({
	enabled,
	language,
	onChooseCity,
}: {
	enabled: boolean;
	language: AppLanguage;
	onChooseCity?: () => void;
}) {
	const { city, restored } = useCalendar();
	const { t } = useTranslation(language);
	if (!enabled || !restored || city) return null;
	return (
		<div
			role="alert"
			className="mb-2 rounded-xl bg-[var(--accent-glow)] px-3 py-2 text-xs text-[var(--text-primary)]"
		>
			<p>{t("settings.calendarDayPill.cityRequired")}</p>
			{onChooseCity ? (
				<button
					type="button"
					onClick={onChooseCity}
					className="min-h-11 font-medium text-[var(--accent-deep)]"
				>
					{t("calendar.chooseCityPill")}
				</button>
			) : null}
		</div>
	);
}
