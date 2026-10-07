import { describe, expect, test } from "bun:test";
import { dec, decJson, enc, encJson } from "../src/services/fields.js";

const KEY_A = "test-rotation-key-A-00000000000001";
const KEY_B = "test-rotation-key-B-00000000000002";

describe("field encryption", () => {
	test("round-trips under one key", async () => {
		const sealed = await enc("Shalom", KEY_A);
		expect(sealed?.startsWith("v1.")).toBe(true);
		expect(await dec(sealed, KEY_A)).toBe("Shalom");
	});

	test("decryption tries each key in the ring in order", async () => {
		const sealed = await enc("Shalom", KEY_A);
		// After rotation the new primary fails but the previous key opens it.
		expect(await dec(sealed, [KEY_B, KEY_A])).toBe("Shalom");
		expect(await dec(sealed, KEY_B)).toBe(null);
		const sealedJson = await encJson({ hello: "Shalom" }, KEY_A);
		expect(await decJson(sealedJson, [KEY_B, KEY_A], {})).toEqual({
			hello: "Shalom",
		});
		expect(await decJson(sealedJson, KEY_B, { fallback: true })).toEqual({
			fallback: true,
		});
	});

	test("tampered envelopes do not decrypt", async () => {
		const sealed = (await enc("Shalom", KEY_A)) ?? "";
		const tampered = `${sealed.slice(0, -2)}AA`;
		expect(await dec(tampered, [KEY_A])).toBe(null);
	});
});
