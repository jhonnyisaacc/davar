import { join } from "node:path";

const port = Number(process.env.PORT ?? 3002);
const hostname = process.env.HOST ?? "0.0.0.0";
const runtimeEnv =
	process.env.PUBLIC_NODE_ENV ?? process.env.NODE_ENV ?? "production";
const defaultIdleTimeout = runtimeEnv === "development" ? 120 : 30;
const idleTimeout = Number(process.env.BUN_IDLE_TIMEOUT ?? defaultIdleTimeout);
const distDir = new URL("./dist/", import.meta.url);
const ts2009DataRoot = join(import.meta.dir, "..", "data", "ts2009");

const getTs2009LocalFilePath = (pathname: string): string | null => {
	const relativePath = pathname.slice("/api/ts2009/".length);
	if (!relativePath || relativePath.includes("\0")) {
		return null;
	}

	const segments = relativePath.split("/").filter(Boolean);
	if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
		return null;
	}

	return join(ts2009DataRoot, ...segments);
};

Bun.serve({
	hostname,
	port,
	idleTimeout,
	async fetch(req: Request) {
		const url = new URL(req.url);
		const pathname = decodeURIComponent(url.pathname);

		if (pathname.startsWith("/api/ts2009/")) {
			const localFilePath = getTs2009LocalFilePath(pathname);
			if (!localFilePath) {
				return new Response("Not Found", { status: 404 });
			}

			const file = Bun.file(localFilePath);
			if (!(await file.exists())) {
				return new Response("Not Found", { status: 404 });
			}

			return new Response(file, {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "public, max-age=300, must-revalidate",
				},
			});
		}

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
