import type { Context } from "hono";

// Mirrors Rails' request.remote_ip: X-Forwarded-For is only honored from
// trusted proxies, walking the chain right to left past trusted hops.
// TRUSTED_PROXIES overrides these defaults (comma-separated IPs or
// IPv4 CIDRs). IPv6 ranges are not supported; list exact addresses instead.
export const DEFAULT_TRUSTED_PROXIES: string[] = [
	"127.0.0.0/8",
	"::1",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
];

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return null;
		const byte = Number(part);
		if (byte < 0 || byte > 255) return null;
		value = value * 256 + byte;
	}
	return value;
}

export function isTrustedProxy(ip: string, trusted: string[]): boolean {
	const normalized = ip.trim().toLowerCase();
	for (const entry of trusted) {
		const candidate = entry.trim().toLowerCase();
		if (candidate.includes("/")) {
			const [base = "", bits = ""] = candidate.split("/");
			const prefix = Number(bits);
			const baseInt = ipv4ToInt(base);
			const ipInt = ipv4ToInt(normalized);
			if (baseInt === null || ipInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
				continue;
			}
			const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
			if (((baseInt & mask) >>> 0) === ((ipInt & mask) >>> 0)) return true;
		} else if (candidate === normalized) {
			return true;
		}
	}
	return false;
}

export function resolveClientIp(input: {
	remoteAddr: string | null;
	forwardedFor: string | null;
	trusted: string[];
}): string {
	const forwarded = (input.forwardedFor ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	// Closest hop first: the socket peer, then XFF entries right to left.
	const closestFirst = [
		...(input.remoteAddr ? [input.remoteAddr] : []),
		...forwarded.slice().reverse(),
	];
	for (const hop of closestFirst) {
		if (!isTrustedProxy(hop, input.trusted)) return hop;
	}
	return forwarded[0] ?? input.remoteAddr ?? "unknown";
}

/** Socket peer address via the Bun server Hono runs on, or null in tests. */
export function socketAddress(c: Context): string | null {
	try {
		// Bun passes the server itself as the fetch env (same lookup as
		// Hono's getBunServer: c.env.server, else c.env).
		const env = c.env as {
			server?: BunServerLike;
			requestIP?: (req: Request) => { address?: string } | null;
		};
		const server: BunServerLike | undefined =
			env && typeof env === "object" && "server" in env
				? (env.server as BunServerLike | undefined)
				: (env as BunServerLike | undefined);
		return server?.requestIP?.(c.req.raw)?.address ?? null;
	} catch {
		return null;
	}
}

interface BunServerLike {
	requestIP?: (req: Request) => { address?: string } | null;
}
