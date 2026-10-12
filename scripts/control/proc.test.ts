import { describe, expect, test } from "bun:test";
import { descendantIds, urlHasPath } from "./proc.ts";

describe("descendantIds", () => {
	test("walks children from a portable pid ppid table", () => {
		const table = "10 1\n11 10\n12 11\n20 1\n";
		expect(descendantIds(table, 10)).toEqual([10, 11, 12]);
	});
});

describe("urlHasPath", () => {
	test("rejects a longer verse path that only shares a prefix", () => {
		expect(
			urlHasPath("http://127.0.0.1:5173/verse/Genesis/1/10", "/verse/Genesis/1/1"),
		).toBe(false);
		expect(
			urlHasPath("http://127.0.0.1:5173/verse/Genesis/1/1", "/verse/Genesis/1/1"),
		).toBe(true);
	});
});
