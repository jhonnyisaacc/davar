export const PRODUCTION_ORIGIN = "https://davar.bible";
export const PREVIEW_IMAGE_PATH = "/og-preview-genesis-1-1.png";
export const PREVIEW_IMAGE_WIDTH = 1280;
export const PREVIEW_IMAGE_HEIGHT = 630;

export type PreviewLanguage = "en" | "es" | "he";

export type PreviewPage =
	| "features"
	| "donate"
	| "settings"
	| "terms"
	| "privacy"
	| "feedback";

export type PreviewRoute =
	| { kind: "home" }
	| { kind: "page"; page: PreviewPage }
	| { kind: "verse"; book: string; chapter?: number; verse?: number }
	| { kind: "word"; word: string }
	| { kind: "search"; query?: string }
	| { kind: "fallback" };

export type PreviewMetadata = {
	title: string;
	description: string;
	canonicalUrl: string;
	ogType: "website";
	ogUrl: string;
	ogImage: string;
	ogImageAlt: string;
	ogLocale: string;
	twitterCard: "summary_large_image";
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string;
	language: PreviewLanguage;
};

export type BuildPreviewMetadataInput = {
	requestUrl: string;
	acceptLanguage?: string | null;
	productionOrigin?: string;
};

const GENERIC_DESCRIPTION: Record<PreviewLanguage, string> = {
	en: "Davar is a place to read, explore, and study Scripture with the original languages and context close at hand.",
	es: "Davar es un lugar para leer, explorar y estudiar las Escrituras con las lenguas originales y su contexto al alcance.",
	he: "דבר הוא מקום לקרוא, לחקור וללמוד את כתבי הקודש עם השפות המקוריות וההקשר בהישג יד.",
};

const GENERIC_TITLE: Record<PreviewLanguage, string> = {
	en: "Davar | Hebrew Scriptures",
	es: "Davar | Escrituras Hebreas",
	he: "דבר | כתבי קודש",
};

const APP_NAME: Record<PreviewLanguage, string> = {
	en: "Davar",
	es: "Davar",
	he: "דבר",
};

const IMAGE_ALT: Record<PreviewLanguage, string> = {
	en: "Genesis 1:1 in Davar",
	es: "Génesis 1:1 en Davar",
	he: "בראשית א׳:א׳ בדבר",
};

const PAGE_TITLES: Record<PreviewPage, Record<PreviewLanguage, string>> = {
	features: { en: "Features", es: "Funciones", he: "תכונות" },
	donate: { en: "Donate", es: "Donar", he: "תרומה" },
	settings: { en: "Settings", es: "Ajustes", he: "הגדרות" },
	terms: { en: "Terms", es: "Términos", he: "תנאים" },
	privacy: { en: "Privacy", es: "Privacidad", he: "פרטיות" },
	feedback: { en: "Feedback", es: "Comentarios", he: "משוב" },
};

const LOCALE_TAGS: Record<PreviewLanguage, string> = {
	en: "en_US",
	es: "es_ES",
	he: "he_IL",
};

const PAGE_SET = new Set<PreviewPage>([
	"features",
	"donate",
	"settings",
	"terms",
	"privacy",
	"feedback",
]);

const STATIC_EXTENSIONS = new Set([
	"css",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"js",
	"json",
	"map",
	"png",
	"svg",
	"ttf",
	"txt",
	"woff",
	"woff2",
	"xml",
]);

export const parseAcceptLanguage = (
	header?: string | null,
): PreviewLanguage => {
	if (!header) return "en";

	const candidates = header
		.split(",")
		.map((part) => {
			const [range, ...params] = part.trim().split(";");
			const qualityParam = params.find((param) =>
				param.trim().startsWith("q="),
			);
			const quality = qualityParam
				? Number.parseFloat(qualityParam.trim().slice(2))
				: 1;
			return {
				tag: range.trim().toLowerCase(),
				quality: Number.isFinite(quality) ? quality : 0,
			};
		})
		.filter((part) => part.tag.length > 0)
		.sort((left, right) => right.quality - left.quality);

	for (const candidate of candidates) {
		const primary = candidate.tag.split("-")[0];
		if (primary === "en" || primary === "es" || primary === "he") {
			return primary;
		}
	}

	return "en";
};

export const shouldRewritePreviewPath = (pathname: string): boolean => {
	if (pathname.startsWith("/api/")) return false;
	if (pathname.startsWith("/data/")) return false;

	const lastSegment = pathname.split("/").filter(Boolean).at(-1);
	if (!lastSegment) return true;

	const dot = lastSegment.lastIndexOf(".");
	if (dot <= 0) return true;

	const extension = lastSegment.slice(dot + 1).toLowerCase();
	return !STATIC_EXTENSIONS.has(extension);
};

export const parsePreviewRoute = (requestUrl: string): PreviewRoute => {
	let url: URL;
	try {
		url = new URL(requestUrl);
	} catch {
		return { kind: "fallback" };
	}

	const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
	if (parts.length === 0 || (parts.length === 1 && parts[0] === "home")) {
		return { kind: "home" };
	}

	const [root, second, third, fourth] = parts;

	if (PAGE_SET.has(root as PreviewPage) && parts.length === 1) {
		return { kind: "page", page: root as PreviewPage };
	}

	if (root === "word") {
		const rawWord = second ?? url.searchParams.get("word") ?? "";
		const word = safeDecode(rawWord);
		if (word && isSafeWordToken(word) && parts.length <= 2) {
			return { kind: "word", word };
		}
		return { kind: "fallback" };
	}

	if (root === "search" && parts.length === 1) {
		const rawQuery =
			url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
		const query = safeDecode(rawQuery);
		return {
			kind: "search",
			query: query && isSafeSearchQuery(query) ? query : undefined,
		};
	}

	if (root === "verse") {
		if (!second) return { kind: "home" };
		if (parts.length > 4) return { kind: "fallback" };

		const book = safeDecode(second);
		if (!book || !isSafeBookToken(book)) return { kind: "fallback" };

		const chapter = parsePositiveInt(third);
		const verse = parsePositiveInt(fourth);
		if (third && chapter === undefined) return { kind: "fallback" };
		if (fourth && verse === undefined) return { kind: "fallback" };

		return { kind: "verse", book, chapter, verse };
	}

	return { kind: "fallback" };
};

export const buildPreviewMetadata = (
	input: BuildPreviewMetadataInput,
): PreviewMetadata => {
	const language = parseAcceptLanguage(input.acceptLanguage);
	const productionOrigin = normalizeOrigin(
		input.productionOrigin ?? PRODUCTION_ORIGIN,
	);
	const requestUrl = new URL(input.requestUrl, productionOrigin);
	const assetOrigin = normalizeOrigin(requestUrl.origin);
	const route = parsePreviewRoute(requestUrl.href);
	const ogImage = `${assetOrigin}${PREVIEW_IMAGE_PATH}`;
	const canonicalPath = canonicalPathForRoute(route, requestUrl.pathname);
	const canonicalUrl = `${productionOrigin}${canonicalPath}`;
	const copy = copyForRoute(route, language);

	return {
		title: copy.title,
		description: copy.description,
		canonicalUrl,
		ogType: "website",
		ogUrl: canonicalUrl,
		ogImage,
		ogImageAlt: IMAGE_ALT[language],
		ogLocale: LOCALE_TAGS[language],
		twitterCard: "summary_large_image",
		twitterTitle: copy.title,
		twitterDescription: copy.description,
		twitterImage: ogImage,
		language,
	};
};

export const applySocialPreviewToHtml = (
	html: string,
	metadata: PreviewMetadata,
): string => {
	let next = html.replace(
		/<title\b[^>]*>[\s\S]*?<\/title>/i,
		`<title>${escapeHtml(metadata.title)}</title>`,
	);

	next = replaceMetaByName(next, "description", metadata.description);
	next = replaceMetaByProperty(next, "og:title", metadata.title);
	next = replaceMetaByProperty(next, "og:type", metadata.ogType);
	next = replaceMetaByProperty(next, "og:url", metadata.ogUrl);
	next = replaceMetaByProperty(next, "og:image", metadata.ogImage);
	next = replaceMetaByProperty(next, "og:image:alt", metadata.ogImageAlt);
	next = replaceMetaByProperty(
		next,
		"og:image:width",
		String(PREVIEW_IMAGE_WIDTH),
	);
	next = replaceMetaByProperty(
		next,
		"og:image:height",
		String(PREVIEW_IMAGE_HEIGHT),
	);
	next = replaceMetaByProperty(next, "og:description", metadata.description);
	next = replaceMetaByProperty(next, "og:locale", metadata.ogLocale);
	next = replaceMetaByName(next, "twitter:card", metadata.twitterCard);
	next = replaceMetaByName(next, "twitter:title", metadata.twitterTitle);
	next = replaceMetaByName(
		next,
		"twitter:description",
		metadata.twitterDescription,
	);
	next = replaceMetaByName(next, "twitter:image", metadata.twitterImage);
	next = replaceLinkByRel(next, "canonical", metadata.canonicalUrl);
	next = replaceHreflang(next, metadata.canonicalUrl);

	return next;
};

const copyForRoute = (
	route: PreviewRoute,
	language: PreviewLanguage,
): { title: string; description: string } => {
	const appName = APP_NAME[language];
	const generic = GENERIC_DESCRIPTION[language];

	if (route.kind === "home") {
		return { title: GENERIC_TITLE[language], description: generic };
	}

	if (route.kind === "page") {
		return {
			title: `${PAGE_TITLES[route.page][language]} — ${appName}`,
			description: generic,
		};
	}

	if (route.kind === "verse") {
		const reference = formatVerseReference(route);
		return {
			title: `${reference} — ${appName}`,
			description: verseDescription(language, reference),
		};
	}

	if (route.kind === "word") {
		return {
			title: `${route.word} — ${appName}`,
			description: wordDescription(language),
		};
	}

	if (route.kind === "search") {
		const title = route.query
			? searchTitle(language, route.query, appName)
			: `${searchLabel(language)} — ${appName}`;
		return {
			title,
			description: searchDescription(language),
		};
	}

	return { title: GENERIC_TITLE[language], description: generic };
};

const canonicalPathForRoute = (
	route: PreviewRoute,
	pathname: string,
): string => {
	if (route.kind === "fallback" || route.kind === "home") {
		return pathname.replace(/\/+$/, "") === "/home" ? "/home" : "/";
	}

	const trimmed = pathname.replace(/\/+$/, "");
	return trimmed.length > 0 ? trimmed : "/";
};

const formatVerseReference = (route: {
	book: string;
	chapter?: number;
	verse?: number;
}): string => {
	const book = formatBookDisplayName(titleCaseBook(route.book));
	if (route.chapter && route.verse) {
		return `${book} ${route.chapter}:${route.verse}`;
	}
	if (route.chapter) {
		return `${book} ${route.chapter}`;
	}
	return book;
};

const formatBookDisplayName = (bookName: string): string => {
	const match = bookName.match(/^(.+?)(\d+)$/);
	if (!match) return bookName;
	return `${match[2]} ${match[1]}`;
};

const titleCaseBook = (bookName: string): string => {
	if (!/^[a-z0-9]+$/.test(bookName)) return bookName;
	return bookName.charAt(0).toUpperCase() + bookName.slice(1);
};

const verseDescription = (
	language: PreviewLanguage,
	reference: string,
): string => {
	if (language === "es") {
		return `Lee ${reference} en Davar, con las lenguas originales y su contexto al alcance.`;
	}
	if (language === "he") {
		return `קראו את ${reference} בדבר, עם השפות המקוריות וההקשר בהישג יד.`;
	}
	return `Read ${reference} in Davar, with the original languages and context close at hand.`;
};

const wordDescription = (language: PreviewLanguage): string => {
	if (language === "es") {
		return "Explora esta palabra en Davar, con las lenguas originales y su contexto al alcance.";
	}
	if (language === "he") {
		return "חקרו מילה זו בדבר, עם השפות המקוריות וההקשר בהישג יד.";
	}
	return "Explore this word in Davar, with the original languages and context close at hand.";
};

const searchDescription = (language: PreviewLanguage): string => {
	if (language === "es") {
		return "Busca en las Escrituras en Davar, con las lenguas originales y su contexto al alcance.";
	}
	if (language === "he") {
		return "חפשו בכתבי הקודש בדבר, עם השפות המקוריות וההקשר בהישג יד.";
	}
	return "Search Scripture in Davar, with the original languages and context close at hand.";
};

const searchTitle = (
	language: PreviewLanguage,
	query: string,
	appName: string,
): string => {
	if (language === "es") return `Búsqueda: ${query} — ${appName}`;
	if (language === "he") return `חיפוש: ${query} — ${appName}`;
	return `Search: ${query} — ${appName}`;
};

const searchLabel = (language: PreviewLanguage): string => {
	if (language === "es") return "Búsqueda";
	if (language === "he") return "חיפוש";
	return "Search";
};

const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/, "");

const parsePositiveInt = (value?: string): number | undefined => {
	if (!value) return undefined;
	if (!/^[0-9]+$/.test(value)) return undefined;
	const parsed = Number.parseInt(value, 10);
	return parsed > 0 ? parsed : undefined;
};

const safeDecode = (value: string): string => {
	try {
		return decodeURIComponent(value).trim();
	} catch {
		return "";
	}
};

const isSafeBookToken = (value: string): boolean => {
	return (
		value.length > 0 &&
		value.length <= 60 &&
		/^[\p{L}\p{M}0-9 '.-]+$/u.test(value)
	);
};

const isSafeWordToken = (value: string): boolean => {
	return (
		value.length > 0 && value.length <= 40 && /^[\p{L}\p{M}0-9-]+$/u.test(value)
	);
};

const isSafeSearchQuery = (value: string): boolean => {
	return (
		value.length > 0 &&
		value.length <= 40 &&
		/^[\p{L}\p{M}0-9 '.-]+$/u.test(value)
	);
};

const escapeHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const replaceContentAttr = (tag: string, content: string): string => {
	const escaped = escapeHtml(content);
	if (/\bcontent\s*=/.test(tag)) {
		return tag.replace(
			/\bcontent\s*=\s*("[^"]*"|'[^']*')/,
			`content="${escaped}"`,
		);
	}
	return tag.replace(/\s*\/?>$/, ` content="${escaped}"$&`);
};

const replaceHrefAttr = (tag: string, href: string): string => {
	const escaped = escapeHtml(href);
	if (/\bhref\s*=/.test(tag)) {
		return tag.replace(/\bhref\s*=\s*("[^"]*"|'[^']*')/, `href="${escaped}"`);
	}
	return tag.replace(/\s*\/?>$/, ` href="${escaped}"$&`);
};

const replaceMetaByProperty = (
	html: string,
	property: string,
	content: string,
): string => {
	const pattern = new RegExp(
		`<meta\\b[^>]*\\bproperty\\s*=\\s*["']${escapeRegExp(property)}["'][^>]*>`,
		"i",
	);
	if (pattern.test(html)) {
		return html.replace(pattern, (tag) => replaceContentAttr(tag, content));
	}
	return html.replace(
		/<\/head>/i,
		`    <meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />\n  </head>`,
	);
};

const replaceMetaByName = (
	html: string,
	name: string,
	content: string,
): string => {
	const pattern = new RegExp(
		`<meta\\b[^>]*\\bname\\s*=\\s*["']${escapeRegExp(name)}["'][^>]*>`,
		"i",
	);
	if (pattern.test(html)) {
		return html.replace(pattern, (tag) => replaceContentAttr(tag, content));
	}
	return html.replace(
		/<\/head>/i,
		`    <meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />\n  </head>`,
	);
};

const replaceLinkByRel = (html: string, rel: string, href: string): string => {
	const pattern = new RegExp(
		`<link\\b[^>]*\\brel\\s*=\\s*["']${escapeRegExp(rel)}["'][^>]*>`,
		"i",
	);
	if (!pattern.test(html)) return html;
	return html.replace(pattern, (tag) => replaceHrefAttr(tag, href));
};

const replaceHreflang = (html: string, href: string): string => {
	return html.replace(
		/<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi,
		(tag) => {
			if (!/\bhreflang\s*=/.test(tag)) return tag;
			return replaceHrefAttr(tag, href);
		},
	);
};

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
