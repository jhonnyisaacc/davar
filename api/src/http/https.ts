import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

// Hono's built-in HSTS directive. Explicit so the header stays on.
const STRICT_TRANSPORT_SECURITY = "max-age=15552000; includeSubDomains";

const securityHeaders = secureHeaders({
	strictTransportSecurity: STRICT_TRANSPORT_SECURITY,
	// Browser clients call this API cross-origin. Hono's default
	// Cross-Origin-Resource-Policy is same-origin and would block those reads.
	crossOriginResourcePolicy: "cross-origin",
});

// Redirect only when a proxy says the client used HTTP. Local Bun sends no
// X-Forwarded-Proto, so `bun run dev` stays on HTTP. Cloudflare "Always Use
// HTTPS" covers the edge; this is the origin backstop.
export function httpsSecurity(): MiddlewareHandler {
	return async (c, next) => {
		if (forwardedProto(c.req.header("x-forwarded-proto")) === "http") {
			// 301 lets clients replay POST, PATCH, and DELETE as GET and drop the body.
			// 308 keeps the method and body. GET and HEAD stay 301.
			return c.redirect(httpsLocation(c.req.url, c.req.header("host")), redirectStatus(c.req.method));
		}
		return securityHeaders(c, next);
	};
}

function redirectStatus(method: string): 301 | 308 {
	const normalized = method.toUpperCase();
	if (normalized === "GET" || normalized === "HEAD") return 301;
	return 308;
}

function forwardedProto(header: string | undefined): string | undefined {
	const first = header?.split(",")[0]?.trim().toLowerCase();
	return first ? first : undefined;
}

function httpsLocation(requestUrl: string, hostHeader: string | undefined): string {
	const url = new URL(requestUrl);
	url.protocol = "https:";
	url.username = "";
	url.password = "";
	const host = hostHeader?.trim();
	if (host) {
		// `url.host = "name"` keeps the previous port. Parse the Host header
		// so an origin port (for example :3000) does not leak into the redirect.
		const parsed = new URL(`http://${host}`);
		url.hostname = parsed.hostname;
		url.port = parsed.port;
	}
	return url.toString();
}
