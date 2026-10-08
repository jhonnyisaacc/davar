import type { AppEnv } from "./config.js";

// Host header comparison for the API_HOSTS allowlist. Ports are ignored so
// `api.example.org:443` matches `api.example.org`.
export function normalizeHost(value: string | undefined): string {
	const trimmed = value?.trim().toLowerCase() ?? "";
	if (!trimmed) return "";
	if (trimmed.startsWith("[")) {
		const end = trimmed.indexOf("]");
		return end === -1 ? trimmed : trimmed.slice(1, end);
	}
	const colon = trimmed.indexOf(":");
	const singleColon = colon > 0 && trimmed.indexOf(":", colon + 1) === -1;
	if (singleColon && /^\d+$/.test(trimmed.slice(colon + 1))) {
		return trimmed.slice(0, colon);
	}
	return trimmed;
}

export function parseHostList(value: string | undefined): string[] {
	if (!value) return [];
	const hosts: string[] = [];
	for (const part of value.split(",")) {
		const host = normalizeHost(part);
		if (host) hosts.push(host);
	}
	return hosts;
}

// An empty list stays open in development and test so local boot works
// without API_HOSTS. Staging and production fail closed.
export function hostAllowed(
	hostHeader: string | undefined,
	allowedHosts: readonly string[],
	env: AppEnv,
): boolean {
	if (allowedHosts.length === 0) {
		return env === "development" || env === "test";
	}
	const host = normalizeHost(hostHeader);
	return host.length > 0 && allowedHosts.includes(host);
}
