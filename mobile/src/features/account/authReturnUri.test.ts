// eslint-disable-next-line import/no-unresolved -- Bun test runner built-in
import { expect, test } from "bun:test";
import { authReturnUri } from "@davar/shared/authReturnUri";
test("native and Expo web select their own callback", () => {
	expect(authReturnUri("ios")).toBe("davar://auth/callback");
	expect(authReturnUri("android")).toBe("davar://auth/callback");
	expect(authReturnUri("web", "http://localhost:8081")).toBe(
		"http://localhost:8081/auth/callback",
	);
	expect(authReturnUri("web", "https://davar.example/path")).toBe(
		"https://davar.example/auth/callback",
	);
	expect(() => authReturnUri("web")).toThrow();
	expect(() => authReturnUri("web", "davar://auth")).toThrow();
});
