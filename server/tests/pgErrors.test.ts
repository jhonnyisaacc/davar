import { beforeEach, describe, expect, test } from "bun:test";
import { isUniqueViolation, pgErrorCode } from "../src/lib/pgErrors.js";
import { makeTestContext, truncateAll } from "./helper.js";

beforeEach(truncateAll);

function wrapped(code: string): Error {
	const driver = Object.assign(new Error(`duplicate key value violates unique constraint`), {
		code,
	});
	return Object.assign(
		new Error(`Failed query: insert into "identities" ...\nparams: a,b,c`),
		{ cause: driver },
	);
}

describe("pg errors", () => {
	test("pgErrorCode unwraps drizzle cause chains", () => {
		expect(pgErrorCode(wrapped("23505"))).toBe("23505");
		expect(pgErrorCode(wrapped("23503"))).toBe("23503");
		expect(pgErrorCode(Object.assign(new Error("x"), { code: "23505" }))).toBe("23505");
		expect(pgErrorCode(new Error("plain failure"))).toBe(null);
		expect(pgErrorCode(null)).toBe(null);
	});

	test("isUniqueViolation detects wrapped 23505 only", () => {
		expect(isUniqueViolation(wrapped("23505"))).toBe(true);
		expect(isUniqueViolation(wrapped("23503"))).toBe(false);
		expect(isUniqueViolation(new Error("duplicate key value"))).toBe(false);
	});

	test("the error boundary maps unique violations to 409 conflict", async () => {
		const { app } = makeTestContext();
		app.post("/api/v1/__conflict_probe__", () => {
			throw wrapped("23505");
		});
		const res = await app.request("/api/v1/__conflict_probe__", { method: "POST" });
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: { code: "conflict" } });
	});

	test("withSavepoint contains a failed statement without aborting", async () => {
		const { testConfig, testDb } = await import("./helper.js");
		const { withSavepoint } = await import("../src/db/client.js");
		const { enc, encJson } = await import("../src/services/fields.js");
		const { users } = await import("../src/db/schema.js");
		const { randomUUID } = await import("node:crypto");
		const config = testConfig();
		const profile = await encJson({ city: "X" }, config.encryptionPrimaryKey);
		const id = randomUUID();
		const name = await enc("Saver", config.encryptionPrimaryKey);
		await testDb().db.transaction(async (tx) => {
			await tx.insert(users).values({ id, displayName: name, profile });
			// Duplicate primary key: rolls back only the savepoint block.
			let caught: unknown = null;
			try {
				await withSavepoint(tx, (sp) =>
					sp.insert(users).values({ id, displayName: name, profile }),
				);
			} catch (error) {
				caught = error;
			}
			expect(isUniqueViolation(caught)).toBe(true);
			// The outer transaction is still usable.
			const rows = await tx.select().from(users);
			expect(rows.some((row) => row.id === id)).toBe(true);
		});
	});
});
