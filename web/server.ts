import { join } from "node:path";
import { serveLocalTs2009 } from "./shared/localTs2009";

const port = Number(process.env.PORT ?? 5173);
const hostname = process.env.HOST ?? "0.0.0.0";
const runtimeEnv =
	process.env.PUBLIC_NODE_ENV ?? process.env.NODE_ENV ?? "production";
const defaultIdleTimeout = runtimeEnv === "development" ? 120 : 30;
const idleTimeout = Number(process.env.BUN_IDLE_TIMEOUT ?? defaultIdleTimeout);
const distDir = new URL("./dist/", import.meta.url);
const ts2009DataRoot = join(import.meta.dir, "..", "data", "ts2009");

Bun.serve({
	hostname,
	port,
	idleTimeout,
	async fetch(req: Request) {
		const translationResponse = await serveLocalTs2009(req, ts2009DataRoot);
		if (translationResponse) return translationResponse;
		const url = new URL(req.url);
		const pathname = decodeURIComponent(url.pathname);

		if (pathname.startsWith("/data/")) {
			const assetPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
			const file = Bun.file(new URL(assetPath, distDir));
			if (await file.exists()) {
				const isVersionDocument =
					pathname === "/data/version.json" ||
					pathname === "/data/manifest.json" ||
					pathname === "/data/metadata.json";
				return new Response(file, {
					headers: {
						"Cache-Control": isVersionDocument
							? "public, max-age=60, must-revalidate"
							: "public, max-age=31536000, immutable",
					},
				});
			}
			return new Response("Not Found", { status: 404 });
		}

		if (pathname !== "/" && pathname.includes(".")) {
			const assetPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
			const file = Bun.file(new URL(assetPath, distDir));
			if (await file.exists()) {
				return new Response(file);
			}
			return new Response("Not Found", { status: 404 });
		}

		const htmlFile = Bun.file(new URL("index.html", distDir));
		return new Response(htmlFile, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=0, must-revalidate",
			},
		});
	},
});

console.log(`[davar-web] server listening on http://${hostname}:${port}`);
console.log(`[davar-web] idleTimeout=${idleTimeout}s (${runtimeEnv})`);
