import { describe, expect, test } from "bun:test";
import { createApp } from "../src/http/app.js";
import { makeTestContext } from "./helper.js";

/** Product HTTP routes the web and mobile clients call. */
const PRODUCT_ROUTES: Array<{ method: string; path: string }> = [
	{ method: "GET", path: "/development/mailbox" },
	{ method: "GET", path: "/api/v1/development/status" },
	{ method: "GET", path: "/up" },
	{ method: "GET", path: "/api/v1/capabilities" },
	{ method: "POST", path: "/api/v1/auth/guest" },
	{ method: "GET", path: "/api/v1/auth/providers" },
	{ method: "POST", path: "/api/v1/auth/exchange" },
	{ method: "DELETE", path: "/api/v1/auth/session" },
	{ method: "POST", path: "/api/v1/auth/:provider/start" },
	{ method: "GET", path: "/api/v1/auth/:provider/callback" },
	{ method: "POST", path: "/api/v1/auth/:provider/callback" },
	{ method: "GET", path: "/api/v1/cities" },
	{ method: "PATCH", path: "/api/v1/account/city" },
	{ method: "GET", path: "/api/v1/account" },
	{ method: "PATCH", path: "/api/v1/account" },
	{ method: "PATCH", path: "/api/v1/account/settings" },
	{ method: "POST", path: "/api/v1/account/admission" },
	{ method: "PATCH", path: "/api/v1/account/notification_preferences" },
	{ method: "GET", path: "/api/v1/account/notifications" },
	{ method: "GET", path: "/api/v1/assemblies/leaders" },
	{ method: "GET", path: "/api/v1/assemblies" },
	{ method: "GET", path: "/api/v1/assemblies/:id" },
	{ method: "POST", path: "/api/v1/assemblies" },
	{ method: "PATCH", path: "/api/v1/assemblies/:id" },
	{ method: "PUT", path: "/api/v1/assemblies/:id" },
	{ method: "POST", path: "/api/v1/assemblies/:id/join" },
	{ method: "DELETE", path: "/api/v1/assemblies/:id/leave" },
	{ method: "GET", path: "/api/v1/assemblies/:id/members" },
	{ method: "POST", path: "/api/v1/assemblies/:id/memberships/:membership_id/decision" },
	{ method: "GET", path: "/api/v1/endorsements" },
	{ method: "POST", path: "/api/v1/endorsements" },
	{ method: "PATCH", path: "/api/v1/endorsements/:id" },
	{ method: "PUT", path: "/api/v1/endorsements/:id" },
	{ method: "GET", path: "/api/v1/articles" },
	{ method: "GET", path: "/api/v1/articles/:id" },
	{ method: "GET", path: "/api/v1/conversations" },
	{ method: "POST", path: "/api/v1/conversations" },
	{ method: "GET", path: "/api/v1/conversations/:id" },
	{ method: "DELETE", path: "/api/v1/conversations/:id" },
	{ method: "POST", path: "/api/v1/conversations/:id/messages" },
	{ method: "DELETE", path: "/api/v1/conversations/:id/memory" },
	{ method: "GET", path: "/api/v1/provider_connections" },
	{ method: "POST", path: "/api/v1/provider_connections" },
	{ method: "DELETE", path: "/api/v1/provider_connections/:id" },
	{ method: "GET", path: "/api/v1/calendar/locations" },
	{ method: "GET", path: "/api/v1/calendar/today" },
	{ method: "GET", path: "/api/v1/calendar/upcoming" },
];

function normalizePath(path: string): string {
	const stripped = path.replace(/\{[^}]*\}/g, "");
	return stripped.length > 1 && stripped.endsWith("/") ? stripped.slice(0, -1) : stripped;
}

describe("product routes", () => {
	test("every product route has a Hono handler with the same method and path", () => {
		expect(PRODUCT_ROUTES).toHaveLength(47);
		const seen = new Set<string>();
		for (const route of PRODUCT_ROUTES) {
			const key = `${route.method} ${route.path}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
		const { deps } = makeTestContext();
		const app = createApp(deps);
		const registered = new Set(
			app.routes
				.filter((route) => route.method !== "ALL")
				.map((route) => `${route.method} ${normalizePath(route.path)}`),
		);
		const missing = PRODUCT_ROUTES.filter((route) => !registered.has(`${route.method} ${route.path}`));
		expect(missing).toEqual([]);
	});
});
