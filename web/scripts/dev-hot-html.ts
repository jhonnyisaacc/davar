import index from "../index.html";
import { serveDevData } from "./dev-hot-gateway";

const port = Number(process.env.PORT ?? 5174);
const hostname = process.env.HOST ?? "0.0.0.0";

// The HTML port also serves data so opening Bun's upstream URL remains usable.
const dataRoute = async (req: Request): Promise<Response> =>
	(await serveDevData(req)) ?? new Response("Not Found", { status: 404 });

Bun.serve({
	hostname,
	port,
	development: true,
	routes: {
		"/data/*": dataRoute,
		"/api/ts2009/*": dataRoute,
		"/*": index,
	},
});

console.log(`[davar-web] dev-hot-html listening on http://${hostname}:${port}`);
