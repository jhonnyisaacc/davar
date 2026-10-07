import { beforeEach, describe, expect, test } from "bun:test";
import { makeTestContext, testConfig, truncateAll } from "./helper.js";
import { resolveClientIp, socketAddress } from "../src/services/remoteIp.js";
import type { Context } from "hono";

beforeEach(truncateAll);

function guestApp(remoteAddr: string | undefined, trustedProxies?: string[]) {
	const config = testConfig();
	return makeTestContext({
		config: { ...config, trustedProxies: trustedProxies ?? config.trustedProxies },
		remoteAddr,
	}).app;
}

async function guestStatus(
	app: ReturnType<typeof guestApp>,
	xff?: string,
): Promise<number> {
	const res = await app.request("/api/v1/auth/guest", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(xff ? { "X-Forwarded-For": xff } : {}),
		},
		body: JSON.stringify({}),
	});
	return res.status;
}

describe("client ip", () => {
	test("spoofed X-Forwarded-For from an untrusted peer is ignored", async () => {
		// Guest limit is 3/min. Six requests each claiming a fresh XFF client
		// from the same socket must still share one bucket.
		const app = guestApp("203.0.113.9");
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			statuses.push(await guestStatus(app, `198.51.100.${i + 1}`));
		}
		expect(statuses).toEqual([201, 201, 201, 429, 429, 429]);
	});

	test("X-Forwarded-For from a trusted proxy is honored", async () => {
		const app = guestApp("10.0.0.5", ["10.0.0.0/8"]);
		for (let i = 0; i < 3; i++) {
			expect(await guestStatus(app, "198.51.100.7")).toBe(201);
		}
		// A different client behind the same proxy gets its own bucket.
		expect(await guestStatus(app, "198.51.100.8")).toBe(201);
		// The first client is now over its own limit.
		expect(await guestStatus(app, "198.51.100.7")).toBe(429);
	});

	test("two real IPs without proxies get independent buckets", async () => {
		const first = guestApp("203.0.113.9");
		const second = guestApp("203.0.113.10");
		for (let i = 0; i < 3; i++) {
			expect(await guestStatus(first)).toBe(201);
		}
		expect(await guestStatus(first)).toBe(429);
		expect(await guestStatus(second)).toBe(201);
	});
});

describe("resolveClientIp", () => {
	test("walks X-Forwarded-For right to left past trusted hops", () => {
		expect(
			resolveClientIp({
				remoteAddr: "10.0.0.5",
				forwardedFor: "198.51.100.7, 10.0.0.6",
				trusted: ["10.0.0.0/8"],
			}),
		).toBe("198.51.100.7");
	});

	test("falls back to the farthest claim when every hop is trusted", () => {
		expect(
			resolveClientIp({
				remoteAddr: "10.0.0.5",
				forwardedFor: "10.0.0.6, 10.0.0.7",
				trusted: ["10.0.0.0/8"],
			}),
		).toBe("10.0.0.6");
	});

	test("exact addresses match, including IPv6 loopback", () => {
		expect(
			resolveClientIp({
				remoteAddr: "::1",
				forwardedFor: "2001:db8::7",
				trusted: ["::1"],
			}),
		).toBe("2001:db8::7");
	});

	test("unknown when no address is known", () => {
		expect(
			resolveClientIp({ remoteAddr: null, forwardedFor: null, trusted: [] }),
		).toBe("unknown");
	});
});

describe("socketAddress", () => {
	function fakeContext(env: unknown): Context {
		return { env, req: { raw: {} } } as unknown as Context;
	}

	test("reads the Bun server passed as the fetch env", () => {
		const c = fakeContext({ requestIP: () => ({ address: "127.0.0.1" }) });
		expect(socketAddress(c)).toBe("127.0.0.1");
	});

	test("supports a nested server env like Hono's getBunServer", () => {
		const c = fakeContext({
			server: { requestIP: () => ({ address: "10.0.0.9" }) },
		});
		expect(socketAddress(c)).toBe("10.0.0.9");
	});

	test("returns null when no server is present", () => {
		expect(socketAddress(fakeContext({}))).toBe(null);
	});
});
