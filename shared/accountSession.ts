import { ProductApiError, type ProductClient } from "./productClient";
import type { Account } from "./productContracts";

// Credential persistence is a platform concern. This store only coordinates account state.
export function createAccountSession(
	api: Pick<ProductClient, "request" | "setSession" | "authenticated">,
) {
	let state: { account: Account | null; ready: boolean; error: string | null } =
		{
			account: null,
			ready: false,
			error: null,
		};
	let generation = 0;
	let restoring: Promise<Account | null> | null = null;
	const handoffs = new Map<string, Promise<Account>>();
	const listeners = new Set<() => void>();
	const update = (patch: Partial<typeof state>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	async function acceptToken(token: string) {
		const version = ++generation;
		await api.setSession(token, "bootstrap");
		try {
			const account = await api.request<Account>("/account");
			if (version !== generation)
				throw new ProductApiError("session_changed", 409);
			await api.setSession(token, account.id);
			if (version !== generation)
				throw new ProductApiError("session_changed", 409);
			update({ account, ready: true, error: null });
			return account;
		} catch (error) {
			if (version === generation) {
				await api.setSession(null, null);
				update({
					account: null,
					ready: true,
					error: error instanceof Error ? error.message : "Unavailable",
				});
			}
			throw error;
		}
	}
	function acceptCode(code: string) {
		const existing = handoffs.get(code);
		if (existing) return existing;
		const version = generation;
		const pending = api
			.request<{ token: string }>("/auth/exchange", {
				method: "POST",
				public: true,
				body: { code },
			})
			.then(({ token }) => {
				if (version !== generation)
					throw new ProductApiError("session_changed", 409);
				return acceptToken(token);
			})
			.finally(() => handoffs.delete(code));
		handoffs.set(code, pending);
		return pending;
	}
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setAccount: (account: Account) => {
			if (account.id === state.account?.id) update({ account });
		},
		acceptToken,
		acceptCode,
		restore: (code?: string | null): Promise<Account | null> => {
			if (restoring) return restoring;
			if (!code && (state.ready || !api.authenticated())) {
				if (!state.ready) update({ ready: true });
				return Promise.resolve(state.account);
			}
			const version = generation;
			const request = code
				? acceptCode(code)
				: api.request<Account>("/account", { cache: true });
			const pending = request
				.then((account) => {
					if (!code && version === generation)
						update({ account, ready: true, error: null });
					return account;
				})
				.catch((error: unknown) => {
					if (version === generation)
						update({
							ready: true,
							error: error instanceof Error ? error.message : "Unavailable",
						});
					throw error;
				})
				.finally(() => {
					if (restoring === pending) restoring = null;
				});
			restoring = pending;
			return pending;
		},
		logout: async () => {
			const version = ++generation;
			restoring = null;
			handoffs.clear();
			try {
				await api.request("/auth/session", { method: "DELETE" });
			} finally {
				if (version === generation) {
					await api.setSession(null, null);
					update({ account: null, ready: true, error: null });
				}
			}
		},
	};
}
