import { afterEach, describe, expect, test } from "bun:test";
import { createDb, type DbHandle } from "../src/db/client.js";

const URL = "postgresql://postgres@127.0.0.1:1/davar_pool_test";
const open: DbHandle[] = [];

afterEach(async () => {
	const pending = open.splice(0);
	await Promise.all(pending.map((handle) => handle.sql.end({ timeout: 0 })));
});

function openedPool(poolSize?: number): number {
	const handle = poolSize === undefined ? createDb(URL) : createDb(URL, poolSize);
	open.push(handle);
	return handle.sql.options.max;
}

describe("database pool", () => {
	test("defaults to 5 when no pool size is passed", () => {
		expect(openedPool()).toBe(5);
	});

	test("uses the pool size it is given", () => {
		expect(openedPool(12)).toBe(12);
	});

	test("still requires DATABASE_URL", () => {
		expect(() => createDb(undefined)).toThrow("DATABASE_URL is required");
	});
});
