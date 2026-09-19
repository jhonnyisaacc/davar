import type { BookResponse } from "@/src/types/api";
import { NativeModules, Platform } from "react-native";
import {
  appendStaticDataVersion,
  shouldVersionStaticPath,
} from "@davar/shared/staticDataPaths";

const DEV_STATIC_DATA_BASE_URL = "http://127.0.0.1:3002/data";
const PROD_STATIC_DATA_BASE_URL = "https://davar.bible/data";
const DEV_TS2009_BASE_URL = "http://127.0.0.1:3002/api/ts2009";
const PROD_TS2009_BASE_URL = "https://davar.bible/api/ts2009";

const staticDataCache = new Map<string, unknown>();
const staticDataInflight = new Map<string, Promise<unknown>>();
let staticDataVersionPromise: Promise<string | null> | null = null;

const STATIC_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.EXPO_PUBLIC_STATIC_FETCH_TIMEOUT_MS?.trim() ||
    (__DEV__ ? "5000" : "12000"),
  10,
);

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

const uniqueUrls = (urls: string[]): string[] => {
  const normalized = urls
    .map((url) => normalizeBaseUrl(url))
    .filter((url) => url.length > 0);
  return [...new Set(normalized)];
};

const getMetroHostCandidate = (): string | null => {
  if (!__DEV__) {
    return null;
  }

  const scriptUrl =
    typeof NativeModules?.SourceCode?.scriptURL === "string"
      ? NativeModules.SourceCode.scriptURL
      : "";

  if (!scriptUrl) {
    return null;
  }

  try {
    const parsed = new URL(scriptUrl);
    if (!parsed.hostname || LOOPBACK_HOSTS.has(parsed.hostname)) {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
};

const expandAndroidLoopbackCandidates = (url: string): string[] => {
  const normalizedInput = normalizeBaseUrl(url);

  if (!__DEV__ || Platform.OS !== "android") {
    return [normalizedInput];
  }

  try {
    const parsed = new URL(normalizedInput);
    if (LOOPBACK_HOSTS.has(parsed.hostname)) {
      const candidates = [parsed.toString()];

      const localhostCandidate = new URL(parsed.toString());
      localhostCandidate.hostname = "localhost";
      candidates.push(localhostCandidate.toString());

      const loopbackCandidate = new URL(parsed.toString());
      loopbackCandidate.hostname = "127.0.0.1";
      candidates.push(loopbackCandidate.toString());

      const metroHost = getMetroHostCandidate();
      if (metroHost) {
        const metroCandidate = new URL(parsed.toString());
        metroCandidate.hostname = metroHost;
        candidates.push(metroCandidate.toString());
      }

      const emulatorCandidate = new URL(parsed.toString());
      emulatorCandidate.hostname = "10.0.2.2";
      candidates.push(emulatorCandidate.toString());

      return uniqueUrls(candidates);
    }
  } catch {
    return [normalizedInput];
  }

  return [normalizedInput];
};

const resolveFirstStaticBaseCandidate = (url: string): string => {
  return expandAndroidLoopbackCandidates(url)[0] ?? normalizeBaseUrl(url);
};

const resolveStaticDataBaseUrl = (): string => {
  const configuredDataBase = process.env.EXPO_PUBLIC_STATIC_DATA_BASE_URL?.trim();
  if (configuredDataBase) {
    return resolveFirstStaticBaseCandidate(configuredDataBase);
  }

  return __DEV__
    ? resolveFirstStaticBaseCandidate(DEV_STATIC_DATA_BASE_URL)
    : normalizeBaseUrl(PROD_STATIC_DATA_BASE_URL);
};

const buildStaticDataBaseCandidates = (): string[] => {
  const configuredDataBase = process.env.EXPO_PUBLIC_STATIC_DATA_BASE_URL?.trim();
  const candidates = [
    ...(configuredDataBase
      ? expandAndroidLoopbackCandidates(configuredDataBase)
      : []),
    ...(__DEV__ ? expandAndroidLoopbackCandidates(DEV_STATIC_DATA_BASE_URL) : []),
    normalizeBaseUrl(PROD_STATIC_DATA_BASE_URL),
  ];

  return uniqueUrls(candidates);
};

const resolveStaticBundlesBaseUrl = (dataBaseUrl: string): string => {
  const configuredBundlesBase =
    process.env.EXPO_PUBLIC_STATIC_BUNDLES_BASE_URL?.trim();
  if (configuredBundlesBase) {
    return resolveFirstStaticBaseCandidate(configuredBundlesBase);
  }

  return `${normalizeBaseUrl(dataBaseUrl)}/bundles`;
};

const buildStaticBundlesBaseCandidates = (
  dataBaseCandidates: string[],
): string[] => {
  const configuredBundlesBase =
    process.env.EXPO_PUBLIC_STATIC_BUNDLES_BASE_URL?.trim();

  const candidates = [
    ...(configuredBundlesBase
      ? expandAndroidLoopbackCandidates(configuredBundlesBase)
      : []),
    ...dataBaseCandidates.map((base) => `${normalizeBaseUrl(base)}/bundles`),
  ];

  return uniqueUrls(candidates);
};

const STATIC_DATA_BASE_URL = resolveStaticDataBaseUrl();
const STATIC_BUNDLES_BASE_URL = resolveStaticBundlesBaseUrl(STATIC_DATA_BASE_URL);
const STATIC_DATA_BASE_CANDIDATES = buildStaticDataBaseCandidates();
const STATIC_BUNDLES_BASE_CANDIDATES = buildStaticBundlesBaseCandidates(
  STATIC_DATA_BASE_CANDIDATES,
);

const buildTs2009BaseCandidates = (): string[] => {
  const configuredBase = process.env.EXPO_PUBLIC_TS2009_BASE_URL?.trim();
  return uniqueUrls([
    ...(configuredBase ? expandAndroidLoopbackCandidates(configuredBase) : []),
    ...(__DEV__ ? expandAndroidLoopbackCandidates(DEV_TS2009_BASE_URL) : []),
    PROD_TS2009_BASE_URL,
  ]);
};

const TS2009_BASE_CANDIDATES = buildTs2009BaseCandidates();

let staticUrlDiagnosticsReported = false;

const truncateForError = (value: string, maxLength = 180): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
};

const looksLikeHtmlPayload = (payload: string): boolean => {
  const normalized = payload.trimStart().toLowerCase();
  return (
    normalized.startsWith("<!doctype") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<?xml")
  );
};

const buildNetworkHint = (requestUrl: string): string => {
  if (!__DEV__) {
    return "";
  }

  try {
    const parsed = new URL(requestUrl);
    const host = parsed.hostname;

    if (Platform.OS === "android" && (host === "10.0.2.2" || LOOPBACK_HOSTS.has(host))) {
      return " In Android dev builds on a physical device, set EXPO_PUBLIC_STATIC_DATA_BASE_URL and EXPO_PUBLIC_STATIC_BUNDLES_BASE_URL to your machine LAN IP (example: http://192.168.1.50:3002/data).";
    }
  } catch {
    return "";
  }

  return "";
};

const wrapFetchNetworkError = (
  requestUrl: string,
  resourceLabel: string,
  error: unknown,
): Error => {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  const hint = buildNetworkHint(requestUrl);
  return new Error(
    `Static ${resourceLabel} network request failed: ${requestUrl} (${message}).${hint}`,
  );
};

const fetchWithTimeout = async (requestUrl: string): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATIC_FETCH_TIMEOUT_MS);

  try {
    return await fetch(requestUrl, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Network request timed out after ${STATIC_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const reportStaticUrlDiagnostics = (): void => {
  if (!__DEV__ || staticUrlDiagnosticsReported) {
    return;
  }

  staticUrlDiagnosticsReported = true;
  const metroHost = getMetroHostCandidate() ?? "unknown";
  console.info(
    `[static-data] base=${STATIC_DATA_BASE_URL} bundles=${STATIC_BUNDLES_BASE_URL} baseCandidates=${STATIC_DATA_BASE_CANDIDATES.join(",")} bundleCandidates=${STATIC_BUNDLES_BASE_CANDIDATES.join(",")} timeoutMs=${STATIC_FETCH_TIMEOUT_MS} platform=${Platform.OS} metroHost=${metroHost}`,
  );
};

const parseStaticJsonPayload = <T>(
  payload: string,
  requestUrl: string,
  contentType: string,
  resourceLabel: string,
): T => {
  if (looksLikeHtmlPayload(payload)) {
    const preview = truncateForError(payload) || "[empty]";
    throw new Error(
      `Static ${resourceLabel} returned HTML instead of JSON: ${requestUrl} (preview: ${preview})`,
    );
  }

  try {
    return JSON.parse(payload) as T;
  } catch {
    const contentTypeLabel = contentType || "unknown";
    const preview = truncateForError(payload) || "[empty]";
    throw new Error(
      `Invalid JSON for static ${resourceLabel}: ${requestUrl} (content-type: ${contentTypeLabel}, preview: ${preview})`,
    );
  }
};

export const getBooks = async (): Promise<BookResponse[]> => {
  const metadata = await staticDataRequest<{ books: BookResponse[] }>(
    "metadata.json",
  );
  return metadata.books;
};

const loadStaticDataVersion = async (): Promise<string | null> => {
  if (!staticDataVersionPromise) {
    staticDataVersionPromise = (async () => {
      try {
        const payload = await staticDataRequest<{
          version?: string;
          data_version?: string;
        }>("version.json");
        return payload.version ?? payload.data_version ?? null;
      } catch {
        return null;
      }
    })();
  }
  return staticDataVersionPromise;
};

export const resetStaticDataRequestCachesForTests = (): void => {
  staticDataCache.clear();
  staticDataInflight.clear();
  staticDataVersionPromise = null;
};

export const staticDataRequest = async <T>(
  relativePath: string,
): Promise<T> => {
  reportStaticUrlDiagnostics();

  const normalizedPath = relativePath.replace(/^\/+/, "");
  const cacheKey = normalizedPath;

  if (staticDataCache.has(cacheKey)) {
    return staticDataCache.get(cacheKey) as T;
  }

  const inflight = staticDataInflight.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const requestPromise = (async () => {
    const errors: string[] = [];
    const version =
      normalizedPath !== "version.json" &&
      shouldVersionStaticPath(normalizedPath)
        ? await loadStaticDataVersion()
        : null;

    for (const baseUrl of STATIC_DATA_BASE_CANDIDATES) {
      const encodedPath = encodeURIComponent(normalizedPath).replace(
        /%2F/g,
        "/",
      );
      const requestUrl = `${baseUrl}/${appendStaticDataVersion(encodedPath, version)}`;
      let response: Response;
      try {
        response = await fetchWithTimeout(requestUrl);
      } catch (error) {
        errors.push(
          wrapFetchNetworkError(requestUrl, `data ${normalizedPath}`, error)
            .message,
        );
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const payload = await response.text();

      if (!response.ok) {
        const contentTypeLabel = contentType || "unknown";
        const preview = truncateForError(payload) || "[empty]";
        errors.push(
          `Static data request failed for ${normalizedPath} with status ${response.status} (url: ${requestUrl}, content-type: ${contentTypeLabel}, preview: ${preview})`,
        );
        continue;
      }

      const parsed = parseStaticJsonPayload<T>(
        payload,
        requestUrl,
        contentType,
        `data ${normalizedPath}`,
      );
      staticDataCache.set(cacheKey, parsed as unknown);
      return parsed;
    }

    throw new Error(
      `Static data request failed for ${normalizedPath} on all candidates: ${errors.join(" | ")}`,
    );
  })();

  staticDataInflight.set(cacheKey, requestPromise);
  try {
    return (await requestPromise) as T;
  } finally {
    staticDataInflight.delete(cacheKey);
  }
};

export const ts2009Request = async <T>(relativePath: string): Promise<T> => {
  const normalizedPath = relativePath.replace(/^\/+/, "");
  const cacheKey = `ts2009:${normalizedPath}`;

  if (staticDataCache.has(cacheKey)) {
    return staticDataCache.get(cacheKey) as T;
  }

  const errors: string[] = [];

  for (const baseUrl of TS2009_BASE_CANDIDATES) {
    const requestUrl = `${baseUrl}/${encodeURIComponent(normalizedPath).replace(/%2F/g, "/")}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(requestUrl);
    } catch (error) {
      errors.push(
        wrapFetchNetworkError(requestUrl, `TS2009 ${normalizedPath}`, error)
          .message,
      );
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = await response.text();

    if (!response.ok) {
      errors.push(
        `TS2009 request failed for ${normalizedPath} with status ${response.status} (url: ${requestUrl}, preview: ${truncateForError(payload) || "[empty]"})`,
      );
      continue;
    }

    const parsed = parseStaticJsonPayload<T>(
      payload,
      requestUrl,
      contentType,
      `TS2009 ${normalizedPath}`,
    );
    staticDataCache.set(cacheKey, parsed as unknown);
    return parsed;
  }

  throw new Error(
    `TS2009 request failed for ${normalizedPath} on all candidates: ${errors.join(" | ")}`,
  );
};

export const staticBundleRequest = async <T>(
  bundleName: string,
): Promise<T> => {
  return staticBundlePathRequest<T>(`${bundleName}.json`);
};

export const staticBundlePathRequest = async <T>(
  relativePath: string,
): Promise<T> => {
  reportStaticUrlDiagnostics();

  const normalizedPath = relativePath.replace(/^\/+/, "");
  const errors: string[] = [];

  for (const baseUrl of STATIC_BUNDLES_BASE_CANDIDATES) {
    const requestUrl = `${baseUrl}/${encodeURIComponent(normalizedPath).replace(/%2F/g, "/")}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(requestUrl);
    } catch (error) {
      errors.push(
        wrapFetchNetworkError(requestUrl, `bundle ${normalizedPath}`, error)
          .message,
      );
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = await response.text();

    if (!response.ok) {
      const contentTypeLabel = contentType || "unknown";
      const preview = truncateForError(payload) || "[empty]";
      errors.push(
        `Static bundle request failed for ${normalizedPath} with status ${response.status} (url: ${requestUrl}, content-type: ${contentTypeLabel}, preview: ${preview})`,
      );
      continue;
    }

    return parseStaticJsonPayload<T>(
      payload,
      requestUrl,
      contentType,
      `bundle ${normalizedPath}`,
    );
  }

  throw new Error(
    `Static bundle request failed for ${normalizedPath} on all candidates: ${errors.join(" | ")}`,
  );
};
