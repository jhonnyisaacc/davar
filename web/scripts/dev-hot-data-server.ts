import { join } from "node:path";

const port = Number(process.env.HOT_DATA_PORT ?? 5175);
const hostname = process.env.HOT_DATA_HOST ?? "localhost";
const webRoot = join(import.meta.dir, "..");
const dataRoot = join(webRoot, "public", "data");

const withCors = (response: Response): Response => {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

Bun.serve({
	hostname,
	port,
	async fetch(req: Request) {
		const url = new URL(req.url);
		const pathname = decodeURIComponent(url.pathname);

		if (req.method === "OPTIONS") {
			return withCors(new Response(null, { status: 204 }));
		}

		if (!pathname.startsWith("/data/")) {
			return withCors(new Response("Not Found", { status: 404 }));
		}

		const relativePath = pathname.slice("/data/".length);
		if (!relativePath || relativePath.includes("..")) {
			return withCors(new Response("Not Found", { status: 404 }));
		}

		const file = Bun.file(join(dataRoot, relativePath));
		if (!(await file.exists())) {
			return withCors(new Response("Not Found", { status: 404 }));
		}

		return withCors(new Response(file));
	},
});

console.log(
	`[davar-web] hot-data-server listening on http://${hostname}:${port}`,
);
