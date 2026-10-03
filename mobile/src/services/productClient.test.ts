// Bun provides this module at runtime; Expo does not index it.
// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from "bun:test";
import {
	ProductClient,
	ProductApiError,
	type ProductTransport,
} from "../../../shared/productClient";
import { scriptureContext } from "../../../shared/productContracts";
const storage = () => {
	const map = new Map<string, string>();
	return {
		map,
		get: async (k: string) => map.get(k) || null,
		set: async (k: string, v: string) => {
			map.set(k, v);
		},
		remove: async (k: string) => {
			map.delete(k);
		},
	};
};
describe("product account cache", () => {
	test("default browser transport retains the global fetch receiver", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = function (this: unknown) {
			expect(this).toBe(globalThis);
			return Promise.resolve(new Response("{}"));
		} as unknown as typeof fetch;
		try {
			const api = new ProductClient("https://api.example", storage());
			await api.request("/articles", { public: true });
		} finally {
			globalThis.fetch = original;
		}
	});
	test("network loss can reuse reads but authorization errors cannot", async () => {
		const cache = storage();
		let status = "success";
		const transport = (async () => {
			if (status === "offline") throw new TypeError("offline");
			return new Response(
				JSON.stringify(
					status === "success"
						? { id: "user-1" }
						: { error: { code: "forbidden" } },
				),
				{ status: status === "denied" ? 403 : 200 },
			);
		}) as ProductTransport;
		const api = new ProductClient("https://api.example", cache, transport);
		await api.setSession("token", "user-1");
		expect(
			await api.request<{ id: string }>("/account", { cache: true }),
		).toEqual({ id: "user-1" });
		status = "offline";
		expect(
			await api.request<{ id: string }>("/account", { cache: true }),
		).toEqual({ id: "user-1" });
		status = "denied";
		await expect(
			api.request("/account", { cache: true }),
		).rejects.toBeInstanceOf(ProductApiError);
		await api.setSession(null, null);
		expect(cache.map.size).toBe(0);
	});
	test("a response arriving after logout is discarded", async () => {
		let finish!: (value: Response) => void;
		const transport = (() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			})) as ProductTransport;
		const cache = storage();
		const api = new ProductClient("https://api.example", cache, transport);
		await api.setSession("token", "first");
		const pending = api.request("/account", { cache: true });
		await api.setSession(null, null);
		finish(new Response(JSON.stringify({ secret: "first" })));
		await expect(pending).rejects.toBeInstanceOf(ProductApiError);
		expect(cache.map.size).toBe(0);
	});
	test("successful mutations invalidate stale reads", async () => {
		const cache = storage();
		const api = new ProductClient(
			"https://api.example",
			cache,
			(async () => new Response("{}")) as ProductTransport,
		);
		await api.setSession("token", "first");
		await api.request("/account", { cache: true });
		expect(cache.map.size).toBe(1);
		await api.request("/account", { method: "PATCH", body: {} });
		expect(cache.map.size).toBe(0);
	});
	test("context preserves source reference, edition, and word position", () => {
		const context = scriptureContext({
			bookId: "John",
			chapter: 1,
			verse: 1,
			edition: "hutter",
			word: { index: 0, text: "דבר" },
		});
		expect(context.reference.system_id).toBe("davar-v1");
		expect(context.reference.book_id).toBe("john");
		expect(context.edition_id).toBe("hutter");
		expect(context.token_index).toBe(0);
		expect(() =>
			scriptureContext({ bookId: "John", chapter: 1, verse: 1, edition: "" }),
		).toThrow();
	});
});
