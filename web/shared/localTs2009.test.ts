import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveLocalTs2009 } from "./localTs2009";

describe("local TS2009 route", () => {
	let dataRoot: string;
	let originalFetch: typeof fetch;
	let requests: { url: string; options?: RequestInit }[];

	beforeEach(async () => {
		dataRoot = await mkdtemp(join(tmpdir(), "davar-ts2009-"));
		originalFetch = globalThis.fetch;
		requests = [];
		globalThis.fetch = (async (
			input: string | URL | Request,
			options?: RequestInit,
		) => {
			requests.push({ url: String(input), options });
			return Response.json({
				chapters: [
					{ number: 1, verses: [{ number: 1, text: "Mock English text" }] },
				],
			});
		}) as typeof fetch;
	});
	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await rm(dataRoot, { recursive: true, force: true });
	});
	const request = (path = "bereshit.json", options?: RequestInit) =>
		new Request(`http://localhost:5173/api/ts2009/${path}`, options);

	test("prefers local licensed files without calling the network", async () => {
		await Bun.write(
			join(dataRoot, "bereshit.json"),
			JSON.stringify({ local: true }),
		);
		const response = await serveLocalTs2009(request(), dataRoot);
		expect(await response?.json()).toEqual({ local: true });
		expect(requests).toHaveLength(0);
	});
	test("uses the deployed endpoint when the local file is missing", async () => {
		const response = await serveLocalTs2009(
			request(undefined, {
				headers: { Cookie: "session=private", Authorization: "Bearer private" },
			}),
			dataRoot,
			"https://davar.bible",
		);
		expect(response?.status).toBe(200);
		if (!response) throw new Error("Expected a TS2009 response");
		expect((await response.json()).chapters[0].verses[0].text).toBe(
			"Mock English text",
		);
		expect(requests[0].url).toBe(
			"https://davar.bible/api/ts2009/bereshit.json",
		);
		expect(requests[0].options?.headers).toBeUndefined();
	});
	test("supports HEAD without returning the book body", async () => {
		const response = await serveLocalTs2009(
			request(undefined, { method: "HEAD" }),
			dataRoot,
		);
		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe("");
		expect(requests[0].options?.method).toBe("HEAD");
	});
	test("can disable the remote fallback", async () => {
		expect((await serveLocalTs2009(request(), dataRoot, "off"))?.status).toBe(
			404,
		);
		expect(requests).toHaveLength(0);
	});
	test("rejects invalid paths and write methods without a network call", async () => {
		for (const path of [
			"%2e%2e%2fsecrets.json",
			"%00.json",
			"%E0%A4%A.json",
			"book.txt",
		]) {
			expect((await serveLocalTs2009(request(path), dataRoot))?.status).toBe(
				404,
			);
		}
		expect(
			(await serveLocalTs2009(request(undefined, { method: "POST" }), dataRoot))
				?.status,
		).toBe(405);
		expect(requests).toHaveLength(0);
	});
	test("does not recursively proxy to the same preview", async () => {
		expect(
			(await serveLocalTs2009(request(), dataRoot, "http://localhost:5173"))
				?.status,
		).toBe(503);
		expect(requests).toHaveLength(0);
	});
	test("reports upstream failures and rejects HTML fallback pages", async () => {
		for (const status of [404, 503]) {
			globalThis.fetch = (async () =>
				new Response("Unavailable", { status })) as unknown as typeof fetch;
			expect((await serveLocalTs2009(request(), dataRoot))?.status).toBe(
				status,
			);
		}
		globalThis.fetch = (async () =>
			new Response("<html></html>", {
				headers: { "content-type": "text/html" },
			})) as unknown as typeof fetch;
		expect((await serveLocalTs2009(request(), dataRoot))?.status).toBe(502);
		globalThis.fetch = (async () => {
			throw new Error("Offline");
		}) as unknown as typeof fetch;
		expect((await serveLocalTs2009(request(), dataRoot))?.status).toBe(503);
	});
});
