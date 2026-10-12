import { DomainError } from "../lib/errors.js";

export const SETTING_KEYS = [
	"themeMode",
	"language",
	"hebrewFontScale",
	"besorahTextVersion",
	"besorahLanguage",
	"showQumran",
	"showFullChapter",
	"seferMode",
	"hebrewOnly",
	"translationOnly",
	"showCantillation",
	"showNikud",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export function validSetting(key: string, value: unknown): boolean {
	switch (key) {
		case "themeMode":
			return value === "light" || value === "dark";
		case "language":
			return value === "en" || value === "es" || value === "he";
		case "besorahTextVersion":
			return value === "delitzsch" || value === "hutter";
		case "besorahLanguage":
			return value === "hebrew" || value === "greek";
		case "hebrewFontScale":
			return typeof value === "number" && value >= 0.5 && value <= 3;
		default:
			return value === true || value === false;
	}
}

export function applySettings(
	current: Record<string, unknown>,
	changes: Record<string, unknown>,
	version: number,
	currentVersion: number,
): { settings: Record<string, unknown>; version: number } {
	for (const key of Object.keys(changes)) {
		if (!(SETTING_KEYS as readonly string[]).includes(key)) {
			throw new DomainError("unknown_setting");
		}
	}
	for (const [key, value] of Object.entries(changes)) {
		if (!validSetting(key, value)) throw new DomainError("invalid_settings");
	}
	if (currentVersion !== version) throw new DomainError("settings_conflict", 409);
	const settings = { ...current, ...changes };
	if (changes.hebrewOnly === true) settings.translationOnly = false;
	if (changes.translationOnly === true) settings.hebrewOnly = false;
	if (!(settings.showFullChapter && (settings.hebrewOnly || settings.translationOnly))) {
		settings.seferMode = false;
	}
	return { settings, version: version + 1 };
}
