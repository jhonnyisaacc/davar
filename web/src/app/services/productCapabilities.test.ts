import { expect, test } from "bun:test";
import {
	CLOSED_CAPABILITIES,
	createCapabilitiesStore,
	normalizeCapabilities,
	type ProductCapabilities,
} from "@davar/shared/productCapabilities";
import type { ProductClient } from "@davar/shared/productClient";

const enabled: ProductCapabilities = {
	flags: {
		ai_provider_connections: false,
		ai_shared_openrouter: true,
		assemblies: true,
	},
	ai: { available: true, shared_openrouter: true, providers: [] },
};

test("capabilities fail closed on malformed responses and enforce parent flags", () => {
	for (const value of [
		null,
		{},
		[],
		{ flags: { assemblies: "true" } },
		{ ai: { available: true } },
	]) {
		expect(normalizeCapabilities(value)).toEqual(CLOSED_CAPABILITIES);
	}
	expect(
		normalizeCapabilities({
			...enabled,
			ai: { ...enabled.ai, providers: ["claude"] },
		}).ai.providers,
	).toEqual([]);
});

test("logout clears enabled capabilities immediately and discards late account responses", async () => {
	const responses: ((value: ProductCapabilities) => void)[] = [];
	const requests: { public: boolean }[] = [];
	let authenticated = true;
	const api = {
		authenticated: () => authenticated,
		request: (_path: string, options: { public: boolean }) => {
			requests.push(options);
			return new Promise<ProductCapabilities>((resolve) =>
				responses.push(resolve),
			);
		},
	} as Pick<ProductClient, "authenticated" | "request">;
	const store = createCapabilitiesStore(api);
	store.setOwner("reader");
	const first = store.refresh();
	expect(requests).toHaveLength(1);
	responses[0](enabled);
	await first;
	expect(store.getSnapshot().capabilities).toEqual(enabled);
	const late = store.refresh();
	authenticated = false;
	store.setOwner(null);
	expect(store.getSnapshot().capabilities).toEqual(CLOSED_CAPABILITIES);
	const loggedOut = store.refresh();
	responses[1](enabled);
	await late;
	expect(store.getSnapshot().capabilities).toEqual(CLOSED_CAPABILITIES);
	responses[2](CLOSED_CAPABILITIES);
	await loggedOut;
	expect(requests.map((r) => r.public)).toEqual([false, false, true]);
});

test("a failed refresh drops previously enabled capabilities", async () => {
	let offline = false;
	const api = {
		authenticated: () => false,
		request: async () => {
			if (offline) throw new Error("offline");
			return enabled;
		},
	} as Pick<ProductClient, "authenticated" | "request">;
	const store = createCapabilitiesStore(api);
	await store.refresh();
	expect(store.getSnapshot().capabilities.ai.available).toBe(true);
	offline = true;
	await store.refresh();
	expect(store.getSnapshot()).toEqual({
		capabilities: CLOSED_CAPABILITIES,
		ready: true,
	});
});
