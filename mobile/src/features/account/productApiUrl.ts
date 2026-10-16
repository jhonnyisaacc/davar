const DEVELOPMENT_API_URL = "http://127.0.0.1:3000";
const PRODUCTION_API_URL = "https://davar-production-ecd0.up.railway.app";

export function resolveProductApiUrl(
	configured: string | undefined,
	dev: boolean,
): string {
	const value = configured?.trim() ?? "";
	if (value.length > 0) return value;
	if (dev) return DEVELOPMENT_API_URL;
	return PRODUCTION_API_URL;
}
