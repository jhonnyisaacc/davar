import { afterEach, describe, expect, test } from "bun:test";
import { createDb, databasePoolMax, type DbHandle } from "../src/db/client.js";

const URL = "postgresql://postgres@127.0.0.1:1/davar_pool_test";
const open: DbHandle[] = [];

afterEach(async () => {
	const pending = open.splice(0);
	await Promise.all(pending.map((handle) => handle.sql.end({ timeout: 0 })));
});

function openedPool(env: NodeJS.ProcessEnv): number {
	const handle = createDb(URL, env);
	open.push(handle);
	return handle.sql.options.max;
}

describe("database pool", () => {
	test("defaults to 5 when DATABASE_POOL_SIZE is unset", () => {
		expect(databasePoolMax(undefined)).toBe(5);
		expect(openedPool({})).toBe(5);
	});

	test("follows a positive DATABASE_POOL_SIZE value", () => {
		expect(databasePoolMax("8")).toBe(8);
		expect(openedPool({ DATABASE_POOL_SIZE: " 12 " })).toBe(12);
	});

	test("falls back to 5 for invalid or non-positive values", () => {
		for (const value of ["", " ", "0", "00", "-1", "abc", "1.5", "+4", "1e1"]) {
			expect(databasePoolMax(value)).toBe(5);
			expect(openedPool({ DATABASE_POOL_SIZE: value })).toBe(5);
		}
	});

	test("reads process.env when no env object is passed", () => {
		const previous = process.env.DATABASE_POOL_SIZE;
		process.env.DATABASE_POOL_SIZE = "7";
		try {
			const handle = createDb(URL);
			open.push(handle);
			expect(handle.sql.options.max).toBe(7);
		} finally {
			if (previous === undefined) delete process.env.DATABASE_POOL_SIZE;
			else process.env.DATABASE_POOL_SIZE = previous;
		}
	});

	test("still requires DATABASE_URL", () => {
		expect(() => createDb(undefined, {})).toThrow("DATABASE_URL is required");
	});
});
