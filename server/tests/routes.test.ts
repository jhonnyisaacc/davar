import { describe, expect, test } from "bun:test";
import { createApp } from "../src/http/app.js";
import { makeTestContext } from "./helper.js";

// Hand-maintained from api/config/routes.rb at origin/feat/davar-v2
// (tip 1a226922). Update this list when Rails adds or removes a route so CI
// fails instead of the drift being discovered in review.
const RAILS_ROUTES: Array<{ method: string; path: string }> = [
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
	{ method: "POST", path: "/api/v1/assemblies" },
	{ method: "GET", path: "/api/v1/assemblies/:id" },
	{ method: "PATCH", path: "/api/v1/assemblies/:id" },
	{ method: "POST", path: "/api/v1/assemblies/:id/join" },
	{ method: "DELETE", path: "/api/v1/assemblies/:id/leave" },
	{ method: "GET", path: "/api/v1/assemblies/:id/members" },
	{ method: "POST", path: "/api/v1/assemblies/:id/memberships/:membership_id/decision" },
	{ method: "GET", path: "/api/v1/endorsements" },
	{ method: "POST", path: "/api/v1/endorsements" },
	{ method: "PATCH", path: "/api/v1/endorsements/:id" },
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
	// Development-only (DAVAR_DEV_SANDBOX=1): still requires handlers.
	{ method: "GET", path: "/development/mailbox" },
	{ method: "GET", path: "/api/v1/development/status" },
];

describe("route parity with Rails", () => {
	test("every Rails route has a Hono handler with the same method and path", () => {
		const { deps } = makeTestContext();
		const app = createApp(deps);
		const registered = new Set(
			app.routes
				.filter((route) => route.method !== "ALL")
				.map((route) => `${route.method} ${route.path}`),
		);
		const missing = RAILS_ROUTES.filter(
			(route) => !registered.has(`${route.method} ${route.path}`),
		);
		expect(missing).toEqual([]);
	});
});
