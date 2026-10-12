/** Native deep links and browser callbacks use separate return URLs. */
export function authReturnUri(platform: string, origin?: string): string {
	if (platform !== "web") return "davar://auth/callback";
	if (!origin) throw new Error("Browser origin is required");
	const url = new URL(origin);
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw new Error("Invalid browser origin");
	return `${url.origin}/auth/callback`;
}
