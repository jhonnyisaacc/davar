import {
	appendStaticDataVersion,
	shouldVersionStaticPath,
} from "../../../../shared/staticDataPaths";

const MAX_CACHE_SIZE = 400;
const jsonCache = new Map<string, Promise<unknown>>();
let staticDataVersionPromise: Promise<string | null> | null = null;

type StaticBase = "" | "/public" | "/web" | "/web/public";

const staticUrlPrefix = (
	(
		import.meta as ImportMeta & {
			env?: Record<string, string | undefined>;
		}
	).env?.PUBLIC_STATIC_URL ?? ""
).replace(/\/+$/, "");

let preferredStaticBase: StaticBase = "";
let staticBaseResolved = false;
const STATIC_BASE_CANDIDATES: StaticBase[] = [
	"",
	"/public",
	"/web",
	"/web/public",
];

const normalizeStaticPath = (path: string): string =>
	path.startsWith("/") ? path : `/${path}`;

type EarlyChapterSlot = {
	path: string;
	promise: Promise<string>;
};

const earlyChapterSlot = (): EarlyChapterSlot | null => {
	const host = globalThis as typeof globalThis & {
		__DAVAR_EARLY_CHAPTER__?: EarlyChapterSlot;
	};
	const slot = host.__DAVAR_EARLY_CHAPTER__;
	if (!slot || typeof slot.path !== "string" || !slot.promise) return null;
	return slot;
};

const readMatchingEarlyChapter = async (
	path: string,
): Promise<string | null> => {
	const slot = earlyChapterSlot();
	if (!slot) return null;

	const requested = normalizeStaticPath(path).split("?")[0];
	const earlyPath = slot.path.split("?")[0];
	if (requested !== earlyPath && !requested.endsWith(earlyPath)) return null;

	try {
		return await slot.promise;
	} catch {
		return null;
	}
};

const buildCandidatePaths = (path: string): string[] => {
	const normalizedPath = normalizeStaticPath(path);
	if (normalizedPath.startsWith("/api/")) {
		return [normalizedPath];
	}

	const orderedBases = staticBaseResolved
		? [preferredStaticBase]
		: [
				preferredStaticBase,
				...STATIC_BASE_CANDIDATES.filter(
					(base) => base !== preferredStaticBase,
				),
			];
	const localPaths = orderedBases.map((base) => `${base}${normalizedPath}`);

	if (!staticUrlPrefix) {
		return localPaths;
	}

	const prefixedPaths = localPaths.map(
		(candidatePath) => `${staticUrlPrefix}${candidatePath}`,
	);

	return [...new Set([...prefixedPaths, ...localPaths])];
};

const inferStaticBaseFromResolvedPath = (
	resolvedPath: string,
	originalPath: string,
): StaticBase => {
	const normalizedPath = normalizeStaticPath(originalPath);

	if (!resolvedPath.endsWith(normalizedPath)) {
		return "";
	}

	const base = resolvedPath.slice(
		0,
		resolvedPath.length - normalizedPath.length,
	);
	if (
		base === "" ||
		base === "/public" ||
		base === "/web" ||
		base === "/web/public"
	) {
		return base;
	}

	return "";
};

const parseStaticJson = async <T>(
	response: Response,
	resolvedPath: string,
): Promise<T> => {
	if (!response.ok) {
		throw new Error(
			`Failed to load static data: ${resolvedPath} (status ${response.status})`,
		);
	}

	const contentType = response.headers.get("content-type") || "";
	const payload = await response.text();
	const normalizedPayload = payload.trimStart().toLowerCase();
	const looksLikeHtml =
		normalizedPayload.startsWith("<!doctype") ||
		normalizedPayload.startsWith("<html");

	if (looksLikeHtml) {
		throw new Error(
			`Static data endpoint returned HTML instead of JSON: ${resolvedPath}`,
		);
	}

	try {
		return JSON.parse(payload) as T;
	} catch {
		const contentTypeLabel = contentType || "unknown";
		throw new Error(
			`Invalid JSON for static data: ${resolvedPath} (content-type: ${contentTypeLabel})`,
		);
	}
};

const loadStaticDataVersion = async (): Promise<string | null> => {
	if (!staticDataVersionPromise) {
		staticDataVersionPromise = (async () => {
			try {
				const payload = await fetchJson<{
					version?: string;
					data_version?: string;
				}>("/data/version.json", { versioned: false, cache: "no-cache" });
				return payload.version ?? payload.data_version ?? null;
			} catch {
				return null;
			}
		})();
	}

	return staticDataVersionPromise;
};

export const fetchJson = async <T>(
	path: string,
	options?: { versioned?: boolean; cache?: RequestCache },
): Promise<T> => {
	// If already cached, move to end (mark as recently used)
	if (jsonCache.has(path)) {
		// biome-ignore lint/style/noNonNullAssertion: safe — guarded by .has() check above
		const promise = jsonCache.get(path)!;
		jsonCache.delete(path);
		jsonCache.set(path, promise);
		return promise as Promise<T>;
	}

	const promise = (async () => {
		const earlyBody = await readMatchingEarlyChapter(path);
		if (earlyBody !== null) {
			return JSON.parse(earlyBody) as T;
		}

		const errors: string[] = [];
		const isApi = normalizeStaticPath(path).startsWith("/api/");
		const troubleshootingHint = isApi
			? "Verify the local Bun server or deployed Pages Function serves this API route."
			: "Verify the web app is launched from the web/ directory (bun run dev) or served from a build that includes copied public data.";
		const shouldVersion =
			options?.versioned ??
			(!isApi && shouldVersionStaticPath(normalizeStaticPath(path).slice(1)));
		// Revalidate metadata and manifests because their URLs have no data version.
		// This also replaces stale HTML cached before a local data route was fixed.
		const cacheMode =
			options?.cache ?? (isApi || !shouldVersion ? "no-cache" : "force-cache");
		const version = shouldVersion ? await loadStaticDataVersion() : null;

		for (const resolvedPath of buildCandidatePaths(path)) {
			try {
				const requestPath = appendStaticDataVersion(resolvedPath, version);
				const response = await fetch(requestPath, { cache: cacheMode });
				const parsed = await parseStaticJson<T>(response, resolvedPath);
				preferredStaticBase = inferStaticBaseFromResolvedPath(
					resolvedPath,
					path,
				);
				staticBaseResolved = true;
				return parsed;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push(message);
			}
		}

		throw new Error(
			`Failed to load static data from all candidates for ${normalizeStaticPath(path)}: ${errors.join(" | ")}. ${troubleshootingHint}`,
		);
	})().catch((error) => {
		jsonCache.delete(path); // Remove failed entry to allow retry
		throw error;
	});

	// Evict oldest if at capacity
	if (jsonCache.size >= MAX_CACHE_SIZE) {
		const firstKey = jsonCache.keys().next().value;
		if (firstKey !== undefined) {
			jsonCache.delete(firstKey);
		}
	}

	jsonCache.set(path, promise);
	return promise as Promise<T>;
};

export const resetStaticDataFetchCaches = (): void => {
	jsonCache.clear();
	staticDataVersionPromise = null;
	preferredStaticBase = "";
	staticBaseResolved = false;
};
