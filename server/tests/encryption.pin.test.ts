import { describe, expect, test } from "bun:test";
import { dec } from "../src/services/fields.js";

const PRIMARY = "test-rotation-key-A-00000000000001";
const LATER = "test-rotation-key-B-00000000000002";

const LEGACY_V1 = "v1.AQIDBAUGBwgJCgsMa4p6AUTFUsDKqiEhyGajrZ0fCVZwrw";

describe("encryption pins", () => {
	test("existing v1 envelopes decrypt with the current primary key", async () => {
		expect(LEGACY_V1.split(".")).toEqual([
			"v1",
			"AQIDBAUGBwgJCgsMa4p6AUTFUsDKqiEhyGajrZ0fCVZwrw",
		]);
		expect(await dec(LEGACY_V1, PRIMARY)).toBe("Shalom");
		expect(await dec(LEGACY_V1, LATER)).toBe(null);
		expect(await dec(LEGACY_V1, [LATER, PRIMARY])).toBe("Shalom");
	});
});
