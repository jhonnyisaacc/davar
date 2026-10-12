import { join } from "node:path";
import { PRODUCTION_ORIGIN } from "./socialPreview";

/** Keep licensed text on the server, preferring local files when available. */
export async function serveLocalTs2009(
	request: Request,
	dataRoot: string,
	remoteOrigin = process.env.TS2009_API_ORIGIN ?? PRODUCTION_ORIGIN,
): Promise<Response | null> {
	const url = new URL(request.url);
	if (!url.pathname.startsWith("/api/ts2009/")) return null;
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method Not Allowed", {
			status: 405,
			headers: { Allow: "GET, HEAD" },
		});
	}

	let relativePath: string;
	try {
		relativePath = decodeURIComponent(
			url.pathname.slice("/api/ts2009/".length),
		);
	} catch {
		return new Response("Not Found", { status: 404 });
	}
	const segments = relativePath.split("/");
	if (
		!relativePath.endsWith(".json") ||
		segments.some(
			(segment) =>
				!/^[a-zA-Z0-9_.-]+$/.test(segment) ||
				segment === "." ||
				segment === "..",
		)
	) {
		return new Response("Not Found", { status: 404 });
	}

	const headers = {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "public, max-age=300, must-revalidate",
	};
	const file = Bun.file(join(dataRoot, ...segments));
	if (await file.exists()) {
		return new Response(request.method === "HEAD" ? null : file, { headers });
	}

	if (!remoteOrigin || remoteOrigin === "off") {
		return new Response("Not Found", { status: 404 });
	}
	try {
		const upstream = new URL(
			`/api/ts2009/${segments.map(encodeURIComponent).join("/")}`,
			remoteOrigin,
		);
		if (upstream.origin === url.origin) {
			return new Response("TS2009 upstream must use a different origin", {
				status: 503,
			});
		}
		// Forward no browser cookies or credentials to the deployed endpoint.
		const response = await fetch(upstream, {
			method: request.method,
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			return new Response("TS2009 translation is unavailable", {
				status: response.status === 404 ? 404 : 503,
			});
		}
		if (!response.headers.get("content-type")?.includes("application/json")) {
			return new Response("TS2009 upstream did not return JSON", {
				status: 502,
			});
		}
		return new Response(request.method === "HEAD" ? null : response.body, {
			headers,
		});
	} catch {
		return new Response("TS2009 translation is unavailable", { status: 503 });
	}
}
