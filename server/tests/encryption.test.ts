import { describe, expect, test } from "bun:test";
import { encryptionKeyId } from "../src/lib/codec.js";
import { dec, decJson, enc, encJson } from "../src/services/fields.js";

const KEY_A = "test-rotation-key-A-00000000000001";
const KEY_B = "test-rotation-key-B-00000000000002";

describe("field encryption", () => {
	test("round-trips under one key", async () => {
		const sealed = await enc("Shalom", KEY_A);
		const again = await enc("Shalom", KEY_A);
		expect(sealed).toMatch(/^v1\.[0-9a-f]{8}\./);
		expect(sealed?.split(".")[1]).toBe(await encryptionKeyId(KEY_A));
		expect(again?.split(".")[1]).toBe(sealed?.split(".")[1]);
		expect(again).not.toBe(sealed);
		expect(await dec(sealed, KEY_A)).toBe("Shalom");
	});

	test("a later key leaves older envelopes readable through the previous-key list", async () => {
		const sealed = await enc("Shalom", KEY_A);
		expect(sealed?.split(".")[1]).toBe(await encryptionKeyId(KEY_A));
		expect(sealed?.split(".")[1]).not.toBe(await encryptionKeyId(KEY_B));
		expect(await dec(sealed, [KEY_B, KEY_A])).toBe("Shalom");
		expect(await dec(sealed, KEY_B)).toBe(null);
		const sealedLater = await enc("Shalom", KEY_B);
		expect(await dec(sealedLater, [KEY_B, KEY_A])).toBe("Shalom");
		const sealedJson = await encJson({ hello: "Shalom" }, KEY_A);
		expect(await decJson(sealedJson, [KEY_B, KEY_A], {})).toEqual({
			hello: "Shalom",
		});
		expect(await decJson(sealedJson, KEY_B, { fallback: true })).toEqual({
			fallback: true,
		});
	});

	test("a key id from another secret does not open the payload", async () => {
		const sealed = (await enc("Shalom", KEY_A)) ?? "";
		const payload = sealed.split(".")[2];
		const forged = `v1.${await encryptionKeyId(KEY_B)}.${payload}`;
		expect(await dec(forged, [KEY_B, KEY_A])).toBe(null);
	});

	test("tampered envelopes do not decrypt", async () => {
		const sealed = (await enc("Shalom", KEY_A)) ?? "";
		const tampered = `${sealed.slice(0, -2)}AA`;
		expect(await dec(tampered, [KEY_A])).toBe(null);
		expect(await dec("v2.533aaaa4.payload", KEY_A)).toBe(null);
		expect(await dec("v1.NOTHEXID.payload", KEY_A)).toBe(null);
	});
});
