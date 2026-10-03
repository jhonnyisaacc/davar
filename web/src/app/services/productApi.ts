import { ProductClient } from "@davar/shared/productClient";
import type { Account } from "@davar/shared/productContracts";
const memory = new Map<string, string>();
function publicApiUrl() {
	try {
		return process.env.PUBLIC_API_URL || "http://127.0.0.1:3000";
	} catch {
		// Bun leaves unset public variables untouched in the browser's dev bundle.
		return "http://127.0.0.1:3000";
	}
}
// Web sessions stay in memory; never store bearer credentials in localStorage.
export const productApi = new ProductClient(publicApiUrl(), {
	get: async (key) => memory.get(key) || null,
	set: async (key, value) => {
		memory.set(key, value);
	},
	remove: async (key) => {
		memory.delete(key);
	},
});
export async function acceptSignIn(code: string): Promise<Account> {
	const { token } = await productApi.request<{ token: string }>(
		"/auth/exchange",
		{ method: "POST", public: true, body: { code } },
	);
	return acceptSessionToken(token);
}
export async function acceptSessionToken(token: string): Promise<Account> {
	await productApi.setSession(token, "bootstrap");
	const account = await productApi.request<Account>("/account");
	await productApi.setSession(token, account.id);
	return account;
}
