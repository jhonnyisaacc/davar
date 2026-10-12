import { describe, expect, test } from "bun:test";
import { makeTestContext, testConfig } from "./helper.js";
import {
	allowedOrigins,
	DEFAULT_WEB_ORIGINS,
	DEVELOPMENT_WEB_ORIGINS,
	originAllowed,
} from "../src/services/webOrigins.js";

describe("web origins", () => {
	test("matches the Rails defaults and development union", () => {
		expect(allowedOrigins({ configured: undefined, development: false })).toEqual(
			DEFAULT_WEB_ORIGINS,
		);
		expect(DEFAULT_WEB_ORIGINS).toEqual([
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:8081",
			"http://127.0.0.1:8081",
		]);
		const dev = allowedOrigins({ configured: undefined, development: true });
		for (const origin of DEVELOPMENT_WEB_ORIGINS) {
			expect(dev).toContain(origin);
		}
		expect(dev).toContain("http://localhost:5173");
	});

	test("configured origins split, trim and drop empties", () => {
		expect(
			allowedOrigins({ configured: " https://a.test,,https://b.test ", development: false }),
		).toEqual(["https://a.test", "https://b.test"]);
	});

	test("hosted product and pages preview origins are allowed", () => {
		const configured = ["https://app.example.test"];
		expect(originAllowed("https://app.example.test", configured)).toBe(true);
		expect(originAllowed("https://davar.bible", configured)).toBe(true);
		expect(originAllowed("https://feat-commentary-sign-in-flag.davar.pages.dev", configured)).toBe(
			true,
		);
		expect(originAllowed("https://8511c1b8.davar.pages.dev", configured)).toBe(true);
		expect(originAllowed("https://davar.pages.dev", configured)).toBe(true);
		expect(originAllowed("http://8511c1b8.davar.pages.dev", configured)).toBe(false);
		expect(originAllowed("https://evil.example.test", configured)).toBe(false);
		expect(originAllowed("https://davar.pages.dev.evil.com", configured)).toBe(false);
		expect(originAllowed("https://notdavar.pages.dev", configured)).toBe(false);
	});
});

describe("api cors", () => {
	const ALLOWED = "https://app.example.test";

	function appWithOrigins(origins: string[]) {
		const config = testConfig();
		return makeTestContext({ config: { ...config, webOrigins: origins } }).app;
	}

	test("an allowed origin passes preflight with the Rails headers", async () => {
		const app = appWithOrigins([ALLOWED]);
		const res = await app.request("/api/v1/account", {
			method: "OPTIONS",
			headers: {
				Origin: ALLOWED,
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "Authorization, Content-Type",
			},
		});
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
		expect(res.headers.get("Access-Control-Allow-Methods") ?? "").toContain("GET");
		expect(res.headers.get("Access-Control-Allow-Methods") ?? "").toContain("DELETE");
		expect(res.headers.get("Access-Control-Allow-Headers") ?? "").toContain("Authorization");
	});

	test("a disallowed origin gets no allow-origin header", async () => {
		const app = appWithOrigins([ALLOWED]);
		const res = await app.request("/api/v1/account", {
			method: "OPTIONS",
			headers: {
				Origin: "https://evil.example.test",
				"Access-Control-Request-Method": "GET",
			},
		});
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(null);
	});

	test("actual responses carry the origin only when allowed", async () => {
		const app = appWithOrigins([ALLOWED]);
		const ok = await app.request("/up", { headers: { Origin: ALLOWED } });
		expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(null);

		const api = await app.request("/api/v1/capabilities", {
			headers: { Origin: ALLOWED },
		});
		expect(api.status).toBe(200);
		expect(api.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
	});
});
