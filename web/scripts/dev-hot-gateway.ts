import { join } from "node:path";
import { serveLocalTs2009 } from "../shared/localTs2009";

const gatewayPort = Number(process.env.PORT ?? 5173);
const gatewayHost = process.env.HOST ?? "0.0.0.0";
const htmlPort = Number(process.env.HOT_HTML_PORT ?? 5174);
const htmlHost = process.env.HOT_HTML_HOST ?? "localhost";
const dataRoot = join(import.meta.dir, "..", "public", "data");
const ts2009DataRoot = join(import.meta.dir, "..", "..", "data", "ts2009");

export const serveDevData = async (req: Request): Promise<Response | null> => {
	const translationResponse = await serveLocalTs2009(req, ts2009DataRoot);
	if (translationResponse) return translationResponse;
	const url = new URL(req.url);
	const pathname = decodeURIComponent(url.pathname);

	if (pathname.startsWith("/data/")) {
		const relativePath = pathname.slice("/data/".length);
		if (!relativePath || relativePath.includes("..")) {
			return new Response("Not Found", { status: 404 });
		}

		const file = Bun.file(join(dataRoot, relativePath));
		if (!(await file.exists())) {
			return new Response("Not Found", { status: 404 });
		}

		return new Response(file);
	}

	return null;
};

if (import.meta.main) {
	Bun.serve({
		hostname: gatewayHost,
		port: gatewayPort,
		async fetch(req: Request) {
			const dataResponse = await serveDevData(req);
			if (dataResponse) return dataResponse;

			const url = new URL(req.url);
			const upstream = new URL(
				url.pathname + url.search,
				`http://${htmlHost}:${htmlPort}`,
			);
			return fetch(new Request(upstream, req));
		},
	});

	console.log(
		`[davar-web] dev-hot-gateway listening on http://${gatewayHost}:${gatewayPort} (html upstream http://${htmlHost}:${htmlPort})`,
	);
}
