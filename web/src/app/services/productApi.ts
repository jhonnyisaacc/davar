import {
	createMemoryCacheStorage,
	ProductClient,
} from "@davar/shared/productClient";
import type { Account } from "@davar/shared/productContracts";
import { createAccountSession } from "@davar/shared/accountSession";
function publicApiUrl() {
	try {
		return process.env.PUBLIC_API_URL || "http://127.0.0.1:3000";
	} catch {
		// Bun leaves unset public variables untouched in the browser's dev bundle.
		return "http://127.0.0.1:3000";
	}
}
// Web sessions stay in memory; never store bearer credentials in localStorage.
export const productApi = new ProductClient(
	publicApiUrl(),
	createMemoryCacheStorage(),
);
export const webSession = createAccountSession(productApi);
export function acceptSessionToken(token: string): Promise<Account> {
	return webSession.acceptToken(token);
}
