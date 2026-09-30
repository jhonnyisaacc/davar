import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ProductClient } from "@davar/shared/productClient";
import type { Account } from "@davar/shared/productContracts";
// Private cache is in memory. It survives brief network loss, never device logout.
const cache = new Map<string, string>();
export const productApi = new ProductClient(
	process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3000",
	{
		get: async (key) => cache.get(key) || null,
		set: async (key, value) => {
			cache.set(key, value);
		},
		remove: async (key) => {
			cache.delete(key);
		},
	},
);
const SESSION_KEY = "davar_v2_session";
export const useSession = create<{
	account: Account | null;
	ready: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	accept: (token: string) => Promise<void>;
	restore: () => Promise<void>;
	logout: () => Promise<void>;
}>((set, get) => ({
	account: null,
	ready: false,
	error: null,
	refresh: async () => {
		const account = await productApi.request<Account>("/account");
		set({ account });
	},
	accept: async (token) => {
		// Bootstrap uses an ephemeral owner until the verified account is fetched.
		await productApi.setSession(token, "bootstrap");
		try {
			const account = await productApi.request<Account>("/account");
			await productApi.setSession(token, account.id);
			if (Platform.OS !== "web")
				await SecureStore.setItemAsync(SESSION_KEY, token);
			set({ account, ready: true, error: null });
		} catch (error) {
			await productApi.setSession(null, null);
			throw error;
		}
	},
	restore: async () => {
		try {
			const token =
				Platform.OS === "web"
					? null
					: await SecureStore.getItemAsync(SESSION_KEY);
			if (token) await get().accept(token);
		} catch {
			set({ error: "Could not restore your session. Please sign in again." });
		} finally {
			set({ ready: true });
		}
	},
	logout: async () => {
		try {
			await productApi.request("/auth/session", { method: "DELETE" });
		} finally {
			await productApi.setSession(null, null);
			if (Platform.OS !== "web") await SecureStore.deleteItemAsync(SESSION_KEY);
			set({ account: null, error: null });
		}
	},
}));

const handoffs = new Map<string, Promise<void>>();
export function completeSignIn(code: string): Promise<void> {
	const existing = handoffs.get(code);
	if (existing) return existing;
	const pending = productApi
		.request<{ token: string }>("/auth/exchange", {
			method: "POST",
			public: true,
			body: { code },
		})
		.then((result) => useSession.getState().accept(result.token));
	handoffs.set(code, pending);
	setTimeout(() => handoffs.delete(code), 60000);
	return pending;
}
