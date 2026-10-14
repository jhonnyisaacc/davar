import { expect, test } from "bun:test";
import { resolveProductApiUrl } from "./productApiUrl";

test("a release build calls the production API when no URL is configured", () => {
	expect(resolveProductApiUrl(undefined, false)).toBe(
		"https://davar-production-ecd0.up.railway.app",
	);
	expect(resolveProductApiUrl("  ", false)).toBe(
		"https://davar-production-ecd0.up.railway.app",
	);
});

test("an explicit URL is used in development and in a release", () => {
	expect(resolveProductApiUrl("http://192.168.1.50:3000", true)).toBe(
		"http://192.168.1.50:3000",
	);
	expect(resolveProductApiUrl("http://192.168.1.50:3000", false)).toBe(
		"http://192.168.1.50:3000",
	);
});

test("development without a URL stays on the local API", () => {
	expect(resolveProductApiUrl(undefined, true)).toBe("http://127.0.0.1:3000");
});
