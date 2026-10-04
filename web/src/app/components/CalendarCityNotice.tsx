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
		<div role="alert" className="mb-2 text-xs text-[var(--text-secondary)]">
			{onChooseCity ? (
				<button
					type="button"
					onClick={onChooseCity}
					className="min-h-11 text-start"
				>
					{t("settings.calendarDayPill.cityRequired")}
				</button>
			) : (
				<p>{t("settings.calendarDayPill.cityRequired")}</p>
			)}
		</div>
	);
}
