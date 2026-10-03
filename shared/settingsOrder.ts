/**
 * Canonical cross-platform settings order (#107).
 *
 * Single source of truth for the sequence of settings options that are
 * shared between web and mobile. Platform-specific options can sit
 * beside related shared controls:
 *
 *   - Both settings screens: Translation Only after Full Chapter
 *   - Mobile only: Nikud, Cantillation, and Clear Storage at the end
 *   - Web only:    Design System, Mobile Design Guide
 *
 * Dependency rules (rendered state may gate visibility/disabled):
 *   - Sefer Style requires Full Chapter enabled.
 *   - Sefer Style is available in every Full Chapter display mode.
 *     Enabling it in bilingual mode selects Translation Only.
 *   - Hebrew-dependent controls (Qumran, Hebrew Only, Cantillation,
 *     Nikud) are dimmed/disabled when Translation Only is active.
 */
export type SharedSettingId =
	| "theme"
	| "language"
	| "besorahLanguage"
	| "besorahTextVersion"
	| "calendarDayPill"
	| "fullChapter"
	| "seferStyle"
	| "hebrewOnly"
	| "qumran";

export const SHARED_SETTINGS_ORDER: readonly SharedSettingId[] = [
	"theme",
	"language",
	"besorahLanguage",
	"besorahTextVersion",
	"calendarDayPill",
	"fullChapter",
	"seferStyle",
	"hebrewOnly",
	"qumran",
] as const;

export type SeferStyleGate = {
	showFullChapter: boolean;
	hebrewOnly: boolean;
	translationOnly: boolean;
};

/** Row is shown only when Full Chapter is on. */
export function isSeferStyleVisible(showFullChapter: boolean): boolean {
	return showFullChapter;
}

/**
 * Full Chapter is the only prerequisite for enabling Sefer Style.
 * The reader selects a single-text mode when Sefer is enabled.
 */
export function canUseSeferStyle({ showFullChapter }: SeferStyleGate): boolean {
	return showFullChapter;
}
