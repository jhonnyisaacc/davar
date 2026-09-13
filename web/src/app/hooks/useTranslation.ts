import en from "../../../../locales/en.json";
import es from "../../../../locales/es.json";
import he from "../../../../locales/he.json";

export type AppLanguage = "en" | "es" | "he";

const translations = {
	en,
	es,
	he,
} as const;

type TranslationValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| TranslationObject
	| TranslationValue[];
type TranslationObject = { [key: string]: TranslationValue };

const resolvePath = (
	source: TranslationObject,
	path: string,
): TranslationValue => {
	return path.split(".").reduce<TranslationValue>((acc, key) => {
		if (acc && typeof acc === "object" && !Array.isArray(acc) && key in acc) {
			return (acc as TranslationObject)[key];
		}
		return undefined;
	}, source);
};

const interpolate = (
	value: string,
	params?: Record<string, string | number>,
): string => {
	if (!params) return value;
	return Object.entries(params).reduce((acc, [key, replacement]) => {
		return acc.replaceAll(`{${key}}`, String(replacement));
	}, value);
};

export const translate = (
	language: AppLanguage,
	key: string,
	params?: Record<string, string | number>,
): string => {
	const locale = translations[language] ?? translations.en;
	const fallback = translations.en;
	const value =
		resolvePath(locale as TranslationObject, key) ??
		resolvePath(fallback as TranslationObject, key) ??
		key;

	if (typeof value === "string") {
		return interpolate(value, params);
	}

	if (value === null || value === undefined) {
		return key;
	}

	return String(value);
};

export const getTranslationValue = <T = TranslationValue>(
	language: AppLanguage,
	key: string,
	fallback?: T,
): T => {
	const locale = translations[language] ?? translations.en;
	const defaultLocale = translations.en;
	const value =
		resolvePath(locale as TranslationObject, key) ??
		resolvePath(defaultLocale as TranslationObject, key);

	if (value === undefined) {
		return fallback as T;
	}

	return value as T;
};

export const useTranslation = (language: AppLanguage) => {
	const t = (key: string, params?: Record<string, string | number>) =>
		translate(language, key, params);
	const get = <T = TranslationValue>(key: string, fallback?: T) =>
		getTranslationValue<T>(language, key, fallback);

	return {
		t,
		get,
		language,
		isRTL: language === "he",
	};
};

export const getSupportTelegramUrl = (_language: AppLanguage): string => {
	return "https://t.me/edyehoshua";
};
