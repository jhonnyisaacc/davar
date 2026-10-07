// Mirrors api/config/web_origins.rb: the browser origins allowed to call /api/*.
export const DEFAULT_WEB_ORIGINS: string[] = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:8081",
	"http://127.0.0.1:8081",
];

const DEVELOPMENT_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"] as const;
const DEVELOPMENT_PORTS = [5173, 5174, 8081] as const;

export const DEVELOPMENT_WEB_ORIGINS: readonly string[] = DEVELOPMENT_HOSTS.flatMap((host) =>
	DEVELOPMENT_PORTS.map((port) => `http://${host}:${port}`),
);

export function allowedOrigins(input: {
	configured: string | undefined;
	development: boolean;
}): string[] {
	const origins =
		input.configured === undefined
			? [...DEFAULT_WEB_ORIGINS]
			: input.configured
					.split(",")
					.map((part) => part.trim())
					.filter((part) => part.length > 0);
	if (!input.development) return origins;
	return [...new Set([...origins, ...DEVELOPMENT_WEB_ORIGINS])];
}
