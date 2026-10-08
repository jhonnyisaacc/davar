import { Hono } from "hono";
import { cors } from "hono/cors";
import { hostAllowlist } from "./hostAllowlist.js";
import { httpsSecurity } from "./https.js";
import { DomainError, errorBody } from "../lib/errors.js";
import { isUniqueViolation, pgErrorCode } from "../lib/pgErrors.js";
import { ValidationError } from "./validation.js";
import type { AppDeps, AppVariables } from "./deps.js";
import { accountRoutes } from "./routes/account.js";
import { articleRoutes } from "./routes/articles.js";
import { assemblyRoutes } from "./routes/assemblies.js";
import { authRoutes } from "./routes/auth.js";
import { calendarRoutes } from "./routes/calendar.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { conversationRoutes } from "./routes/conversations.js";
import { developmentRoutes } from "./routes/development.js";
import { endorsementRoutes } from "./routes/endorsements.js";
import { providerConnectionRoutes } from "./routes/providerConnections.js";

export function createApp(deps: AppDeps): Hono<{ Variables: AppVariables }> {
	const app = new Hono<{ Variables: AppVariables }>();

	app.use(
		hostAllowlist({
			env: deps.config.env,
			allowedHosts: deps.config.allowedHosts,
		}),
	);
	app.use(httpsSecurity());

	app.use(async (c, next) => {
		c.set("deps", deps);
		await next();
	});

	// Mirrors api/config/initializers/cors.rb: only /api/* is reachable from
	// browsers, with the Authorization/Content-Type headers Rails allows.
	app.use(
		"/api/*",
		cors({
			origin: (origin) => (deps.config.webOrigins.includes(origin) ? origin : null),
			allowHeaders: ["Authorization", "Content-Type"],
			allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			maxAge: 7200,
		}),
	);

	app.get("/up", (c) => c.json({ status: "ok" }));

	app.route("/", developmentRoutes);

	const v1 = new Hono<{ Variables: AppVariables }>();
	v1.use(async (c, next) => {
		await next();
		c.header("Cache-Control", "no-store");
	});
	v1.route("/auth", authRoutes);
	v1.route("/", capabilitiesRoutes);
	v1.route("/", accountRoutes);
	v1.route("/", assemblyRoutes);
	v1.route("/", endorsementRoutes);
	v1.route("/", articleRoutes);
	v1.route("/", conversationRoutes);
	v1.route("/", providerConnectionRoutes);
	v1.route("/", calendarRoutes);

	app.route("/api/v1", v1);

	app.notFound((c) => c.json({ error: { code: "not_found" } }, 404));

	app.onError((error, c) => {
		if (error instanceof ValidationError) {
			return c.json(
				{ error: { code: error.code, details: error.details } },
				error.status as 422,
			);
		}
		if (error instanceof DomainError) {
			return c.json(errorBody(error), error.status as 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 503);
		}
		if (isUniqueViolation(error)) {
			return c.json({ error: { code: "conflict" } }, 409);
		}
		// Never log error messages or params: drizzle failures embed bound
		// values (tokens, emails, ciphertext) in both.
		console.error(
			JSON.stringify({
				event: "request_error",
				name: (error as Error)?.name ?? "Error",
				pg_code: pgErrorCode(error),
				method: c.req.method,
				route: c.req.routePath,
			}),
		);
		return c.json({ error: { code: "internal_error" } }, 500);
	});

	return app;
}
