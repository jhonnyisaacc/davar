import { expect, test } from "bun:test";
import { createAccountSession } from "@davar/shared/accountSession";
import {
	createMemoryCacheStorage,
	ProductClient,
} from "@davar/shared/productClient";
import type { Account } from "@davar/shared/productContracts";

const account = { id: "reader", display_name: "Reader" } as Account;
const json = (value: unknown, status = 200) => Response.json(value, { status });

test("concurrent callback mounts exchange once and share verified account updates", async () => {
	const paths: string[] = [];
	const api = new ProductClient(
		"https://example.test",
		createMemoryCacheStorage(),
		async (url) => {
			paths.push(url);
			return url.endsWith("/auth/exchange")
				? json({ token: "token" })
				: json(account);
		},
	);
	const session = createAccountSession(api);
	await Promise.all([
		session.restore("handoff"),
		session.restore(),
		session.restore("handoff"),
	]);
	expect(paths.filter((path) => path.endsWith("/auth/exchange"))).toHaveLength(
		1,
	);
	expect(paths.filter((path) => path.endsWith("/account"))).toHaveLength(1);
	expect(api.authenticated()).toBe(true);
	session.setAccount({ ...account, display_name: "Updated" });
	expect((await session.restore())?.display_name).toBe("Updated");
	session.setAccount({ ...account, id: "someone-else" });
	expect(session.getSnapshot().account?.id).toBe("reader");
	expect(paths).toHaveLength(2);
});

test("invalid callbacks finish restoration and failed bootstrap clears credentials", async () => {
	const api = new ProductClient(
		"https://example.test",
		createMemoryCacheStorage(),
		async () => json({ error: { code: "invalid_handoff" } }, 422),
	);
	const session = createAccountSession(api);
	await expect(session.restore("expired")).rejects.toThrow("invalid_handoff");
	expect(session.getSnapshot()).toEqual({
		account: null,
		ready: true,
		error: "invalid_handoff",
	});
	await expect(session.acceptToken("invalid")).rejects.toThrow();
	expect(api.authenticated()).toBe(false);
});

test("logout discards a delayed account bootstrap", async () => {
	let finish!: (response: Response) => void;
	let started!: () => void;
	const loading = new Promise<void>((resolve) => {
		started = resolve;
	});
	const api = new ProductClient(
		"https://example.test",
		createMemoryCacheStorage(),
		async (url) =>
			url.endsWith("/account")
				? new Promise<Response>((resolve) => {
						finish = resolve;
						started();
					})
				: new Response(null, { status: 204 }),
	);
	const session = createAccountSession(api);
	const accepting = session.acceptToken("token");
	// Observe the rejection before completing the delayed request.
	const rejected = accepting.then(
		() => null,
		(error: Error) => error,
	);
	await loading;
	await session.logout();
	finish(json(account));
	expect((await rejected)?.message).toBe("session_changed");
	expect(api.authenticated()).toBe(false);
	expect(session.getSnapshot().account).toBeNull();
});

test("a failed remote logout still removes local credentials and notifies every subscriber", async () => {
	const api = new ProductClient(
		"https://example.test",
		createMemoryCacheStorage(),
		async (url) =>
			url.endsWith("/account")
				? json(account)
				: json({ error: { code: "unavailable" } }, 503),
	);
	const session = createAccountSession(api);
	await session.acceptToken("token");
	const seen: (string | null)[] = [];
	const stop = session.subscribe(() =>
		seen.push(session.getSnapshot().account?.id ?? null),
	);
	await expect(session.logout()).rejects.toThrow("unavailable");
	expect(seen).toEqual([null]);
	expect(api.authenticated()).toBe(false);
	stop();
});

test("a late logout cannot clear a newer account session", async () => {
	let finish!: (response: Response) => void;
	let started!: () => void;
	const loading = new Promise<void>((resolve) => {
		started = resolve;
	});
	let owner = account;
	const api = new ProductClient(
		"https://example.test",
		createMemoryCacheStorage(),
		async (url) =>
			url.endsWith("/auth/session")
				? new Promise<Response>((resolve) => {
						finish = resolve;
						started();
					})
				: json(owner),
	);
	const session = createAccountSession(api);
	await session.acceptToken("first-token");
	const loggingOut = session.logout().catch((error: Error) => error);
	await loading;
	owner = { ...account, id: "new-reader" };
	await session.acceptToken("second-token");
	finish(new Response(null, { status: 204 }));
	expect((await loggingOut)?.message).toBe("session_changed");
	expect(session.getSnapshot().account?.id).toBe("new-reader");
	expect(api.authenticated()).toBe(true);
});
