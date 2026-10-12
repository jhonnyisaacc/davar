export const SUPPORT_EMAIL = "hi@davar.bible";
export const CREATOR_TELEGRAM_HANDLE = "@jhonnyisaacc";
export const CREATOR_TELEGRAM_URL = "https://t.me/jhonnyisaacc";
export const GITHUB_URL = "https://github.com/jhonnyisaacc/davar";
export const COMMENTARY_SOURCE_URL = "https://shaul.vercel.app/";

export const SETTINGS_RESOURCES = [
  { id: "sources", path: "/sources", label: "settings.links.textSources" },
  { id: "commentarySources", path: "/commentary-sources", label: "settings.links.commentarySources" },
  { id: "donate", path: "/donate", label: "settings.links.donate" },
  { id: "terms", path: "/terms", label: "settings.links.terms" },
  { id: "privacy", path: "/privacy", label: "settings.links.privacy" },
  { id: "support", path: "/support", label: "settings.links.support" },
] as const;

export const TEXT_SOURCE_KEYS = [
  "hebrewText", "besorah", "greekText", "greekTags", "greekLexicon",
  "spanishTranslation", "englishTranslation", "dictionary",
] as const;

export const ATTRIBUTION_KEYS = ["stepbible", "sblgnt", "ubs"] as const;
