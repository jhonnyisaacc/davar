import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeMode } from "@/src/theme";
import type { BesorahTextVersion } from "@davar/shared/translationConfig";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";

const STORAGE_KEYS = {
  themeMode: "davar.themeMode",
  hebrewFontScale: "davar.hebrewFontScale",
  bookmarks: "davar.bookmarks",
  language: "davar.language",
  besorahTextVersion: "davar.besorahTextVersion",
  besorahLanguage: "davar.besorahLanguage",
  showQumran: "davar.showQumran",
  showFullChapter: "davar.showFullChapter",
  seferMode: "davar.seferMode",
  hebrewOnly: "davar.hebrewOnly",
  translationOnly: "davar.translationOnly",
  wordHintCount: "davar.wordHintCount",
  swipeUpHintCount: "davar.swipeUpHintCount",
  besorahDisclaimerCount: "davar.besorahDisclaimerCount",
  currentVerseId: "davar.currentVerseId",
  codepushCount: "davar.codepushCount",
  lastSeenUpdateId: "davar.lastSeenUpdateId",
};

export const loadThemeMode = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.themeMode);
  return value === "dark" ? "dark" : "light";
};

export const saveThemeMode = async (mode: ThemeMode) => {
  await AsyncStorage.setItem(STORAGE_KEYS.themeMode, mode);
};

export const loadHebrewFontScale = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.hebrewFontScale);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const saveHebrewFontScale = async (scale: number) => {
  await AsyncStorage.setItem(STORAGE_KEYS.hebrewFontScale, String(scale));
};

export const loadBookmarks = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.bookmarks);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveBookmarks = async (bookmarks: string[]) => {
  await AsyncStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
};

export type AppLanguage = "en" | "es" | "he";

const normalizeLanguage = (value: string | null | undefined): AppLanguage | null => {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es";
  }
  if (normalized === "he" || normalized.startsWith("he-")) {
    return "he";
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  return null;
};

export const getDefaultLanguage = (): AppLanguage => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return normalizeLanguage(locale) ?? "en";
};

export const loadLanguage = async (): Promise<AppLanguage> => {
  const storedLanguage = normalizeLanguage(
    await AsyncStorage.getItem(STORAGE_KEYS.language),
  );
  if (storedLanguage) {
    return storedLanguage;
  }

  return getDefaultLanguage();
};

export const saveLanguage = async (language: AppLanguage) => {
  await AsyncStorage.setItem(STORAGE_KEYS.language, language);
};

export const loadBesorahTextVersion = async (): Promise<BesorahTextVersion> => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.besorahTextVersion);
  return value === "hutter" ? "hutter" : "delitzsch";
};

export const saveBesorahTextVersion = async (value: BesorahTextVersion) => {
  await AsyncStorage.setItem(STORAGE_KEYS.besorahTextVersion, value);
};

export const loadBesorahLanguage = async (): Promise<BesorahLanguage> => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.besorahLanguage);
  return value === "greek" ? "greek" : "hebrew";
};

export const saveBesorahLanguage = async (value: BesorahLanguage) => {
  await AsyncStorage.setItem(STORAGE_KEYS.besorahLanguage, value);
};

const parseBoolean = (value: string | null, fallback: boolean) => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
};

export const loadShowQumran = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.showQumran);
  return parseBoolean(value, false);
};

export const saveShowQumran = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEYS.showQumran, String(value));
};

export const loadShowFullChapter = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.showFullChapter);
  return parseBoolean(value, false);
};

export const saveShowFullChapter = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEYS.showFullChapter, String(value));
};

export const loadSeferMode = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.seferMode);
  return parseBoolean(value, false);
};

export const saveSeferMode = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEYS.seferMode, String(value));
};

export const loadHebrewOnly = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.hebrewOnly);
  return parseBoolean(value, false);
};

export const saveHebrewOnly = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEYS.hebrewOnly, String(value));
};

export const loadTranslationOnly = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.translationOnly);
  return parseBoolean(value, false);
};

export const saveTranslationOnly = async (value: boolean) => {
  await AsyncStorage.setItem(STORAGE_KEYS.translationOnly, String(value));
};

export const loadWordHintCount = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.wordHintCount);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const saveWordHintCount = async (count: number) => {
  await AsyncStorage.setItem(STORAGE_KEYS.wordHintCount, String(count));
};

export const loadSwipeUpHintCount = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.swipeUpHintCount);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const saveSwipeUpHintCount = async (count: number) => {
  await AsyncStorage.setItem(STORAGE_KEYS.swipeUpHintCount, String(count));
};

export const loadBesorahDisclaimerCount = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.besorahDisclaimerCount);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const saveBesorahDisclaimerCount = async (count: number) => {
  await AsyncStorage.setItem(
    STORAGE_KEYS.besorahDisclaimerCount,
    String(count),
  );
};

export const loadCurrentVerseId = async (): Promise<string | null> => {
  return AsyncStorage.getItem(STORAGE_KEYS.currentVerseId);
};

export const saveCurrentVerseId = async (id: string) => {
  await AsyncStorage.setItem(STORAGE_KEYS.currentVerseId, id);
};

export const loadCodepushCount = async () => {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.codepushCount);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const saveCodepushCount = async (count: number) => {
  await AsyncStorage.setItem(STORAGE_KEYS.codepushCount, String(count));
};

export const loadLastSeenUpdateId = async (): Promise<string | null> => {
  return AsyncStorage.getItem(STORAGE_KEYS.lastSeenUpdateId);
};

export const saveLastSeenUpdateId = async (id: string) => {
  await AsyncStorage.setItem(STORAGE_KEYS.lastSeenUpdateId, id);
};

export const clearStorage = async () => {
  await Promise.all(
    Object.values(STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key)),
  );
};
