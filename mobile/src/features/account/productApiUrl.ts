const DEVELOPMENT_API_URL = "http://127.0.0.1:3000";

export function resolveProductApiUrl(
	configured: string | undefined,
	dev: boolean,
): string {
	const value = configured?.trim() ?? "";
	if (value.length > 0) return value;
	if (dev) return DEVELOPMENT_API_URL;
	return DEVELOPMENT_API_URL;
}
