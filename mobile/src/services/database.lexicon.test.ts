import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { LexiconResponse } from "@/src/types/api";

const POISON_STRONG = "H9999";
let sqlite = new Database(":memory:");

mock.module("expo-sqlite", () => ({
	openDatabaseAsync: async () => ({
		getAllAsync: async (sql: string, params: unknown[] = []) =>
			sqlite.query(sql).all(...(params as string[])),
		runAsync: async (sql: string, params: unknown[] = []) => {
			if (params[0] === POISON_STRONG) {
				throw new Error("disk I/O error");
			}
			return sqlite.query(sql).run(...(params as string[]));
		},
	}),
}));

const { fetchLexiconEntry, initializeDatabase, replaceLexiconEntries } =
	await import("./database");

const entry = (strong: string): LexiconResponse =>
	({
		strong_number: strong,
		hebrew: "",
		definitions: [{ text: `def ${strong}` }],
	}) as unknown as LexiconResponse;

const entries = (count: number, offset = 1) =>
	Array.from({ length: count }, (_, index) => entry(`H${index + offset}`));

const storedStrongs = () =>
	(sqlite.query("SELECT strong FROM lexicon ORDER BY strong;").all() as {
		strong: string;
	}[]).map((row) => row.strong);

beforeEach(async () => {
	sqlite = new Database(":memory:");
	await initializeDatabase();
});

describe("replaceLexiconEntries", () => {
	test("keeps the previous lexicon when a sync fails after the first batch", async () => {
		const previous = entries(1200);
		await replaceLexiconEntries(previous);
		const before = storedStrongs();

		const failing = [...entries(700, 5000), entry(POISON_STRONG)];
		const originalError = console.error;
		console.error = () => {};
		try {
			await expect(replaceLexiconEntries(failing)).rejects.toThrow(
				"disk I/O error",
			);
		} finally {
			console.error = originalError;
		}

		expect(storedStrongs()).toEqual(before);
		expect(before).toHaveLength(1200);
		expect(await fetchLexiconEntry("H1200")).not.toBeNull();
		expect(await fetchLexiconEntry("H5000")).toBeNull();
	});

	test("a successful replace removes rows the new bundle withholds", async () => {
		await replaceLexiconEntries([entry("H1"), entry("H2"), entry("H3")]);

		await replaceLexiconEntries([entry("H1"), entry("H3")]);

		expect(storedStrongs()).toEqual(["H1", "H3"]);
		expect(await fetchLexiconEntry("H2")).toBeNull();
	});
});
