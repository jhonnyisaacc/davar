/**
 * Storage schema and migration utilities for Davar app persistence
 */

import type { BesorahTextVersion } from "../../../../shared/translationConfig";
import type { BesorahLanguage } from "../../../../shared/greekBesorah";

export interface ReadingStateV2 {
	version: 2;
	book: string;
	chapter: number;
	verse: number;
	language: "en" | "es" | "he";
	besorahLanguage: BesorahLanguage;
	besorahTextVersion: BesorahTextVersion;
	hutterAnnouncementRelease: string;
	theme: "light" | "dark";
	showQumran: boolean;
	hebrewOnly: boolean;
	translationOnly: boolean;
	showNikud: boolean;
	showCantillation: boolean;
	showFullChapter: boolean;
	seferMode: boolean;
	scrollNavHintCount: number;
	desktopScrollHintCount: number;
	lastPositionByBook: Record<string, { chapter: number; verse: number }>;
}

export interface ReadingStateV1 {
	book?: string;
	chapter?: number;
	verse?: number;
	language?: "en" | "es" | "he";
	scrollNavHintCount?: number;
	desktopScrollHintCount?: number;
}

const STORAGE_KEY = "davar.readingState";

function resolveDefaultLanguage(): "en" | "es" | "he" {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return "en";
	}

	const preferred = [navigator.language, ...(navigator.languages ?? [])]
		.filter(
			(value): value is string => typeof value === "string" && value.length > 0,
		)
		.map((value) => value.toLowerCase());

	for (const locale of preferred) {
		const primaryLanguage = locale.split("-")[0];
		if (primaryLanguage === "es") return "es";
		if (primaryLanguage === "he") return "he";
		if (primaryLanguage === "en") return "en";
	}

	return "en";
}

/**
 * Migrate v1 schema to v2 schema
 */
function migrateV1toV2(v1Data: ReadingStateV1): ReadingStateV2 {
	return {
		version: 2,
		book: v1Data.book ?? "Genesis",
		chapter: v1Data.chapter ?? 1,
		verse: v1Data.verse ?? 1,
		language: v1Data.language ?? resolveDefaultLanguage(),
		besorahLanguage: "hebrew",
		besorahTextVersion: "delitzsch",
		hutterAnnouncementRelease: "",
		theme: "light",
		showQumran: false,
		hebrewOnly: false,
		translationOnly: false,
		showNikud: true,
		showCantillation: false,
		showFullChapter: false,
		seferMode: false,
		scrollNavHintCount: v1Data.scrollNavHintCount ?? 0,
		desktopScrollHintCount: v1Data.desktopScrollHintCount ?? 0,
		lastPositionByBook: {
			[v1Data.book ?? "Genesis"]: {
				chapter: v1Data.chapter ?? 1,
				verse: v1Data.verse ?? 1,
			},
		},
	};
}

/**
 * Get stored reading state from localStorage with automatic migration
 */
export function getStoredReadingState(): ReadingStateV2 | null {
	if (typeof window === "undefined") return null;

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const parsed = JSON.parse(raw);

		// Check if it's v2 format (has version field)
		if (parsed.version === 2) {
			const defaults = createDefaultReadingState();
			return {
				...defaults,
				...parsed,
				lastPositionByBook:
					parsed.lastPositionByBook ?? defaults.lastPositionByBook,
			} as ReadingStateV2;
		}

		// Migrate v1 to v2
		const migrated = migrateV1toV2(parsed as ReadingStateV1);
		// Save the migrated version
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
		return migrated;
	} catch {
		return null;
	}
}

/**
 * Save reading state to localStorage
 */
export function saveReadingState(state: ReadingStateV2): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Silently fail if localStorage is not available
		console.warn("Failed to save reading state to localStorage");
	}
}

/**
 * Get the last position for a specific book
 */
export function getLastPositionForBook(
	state: ReadingStateV2,
	book: string,
): { chapter: number; verse: number } {
	return state.lastPositionByBook[book] || { chapter: 1, verse: 1 };
}

/**
 * Update last position for a book
 */
export function updateLastPositionForBook(
	state: ReadingStateV2,
	book: string,
	chapter: number,
	verse: number,
): ReadingStateV2 {
	return {
		...state,
		lastPositionByBook: {
			...state.lastPositionByBook,
			[book]: { chapter, verse },
		},
	};
}

/**
 * Create default reading state
 */
export function createDefaultReadingState(): ReadingStateV2 {
	return {
		version: 2,
		book: "Genesis",
		chapter: 1,
		verse: 1,
		language: resolveDefaultLanguage(),
		besorahLanguage: "hebrew",
		besorahTextVersion: "delitzsch",
		hutterAnnouncementRelease: "",
		theme: "light",
		showQumran: false,
		hebrewOnly: false,
		translationOnly: false,
		showNikud: true,
		showCantillation: false,
		showFullChapter: false,
		seferMode: false,
		scrollNavHintCount: 0,
		desktopScrollHintCount: 0,
		lastPositionByBook: {
			Genesis: { chapter: 1, verse: 1 },
		},
	};
}
