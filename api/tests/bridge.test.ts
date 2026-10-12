import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runBridge } from "../src/services/bridge.js";
import { DomainError } from "../src/lib/errors.js";

const fixtures = join(import.meta.dir, "fixtures");

describe("bridge", () => {
	test("a stuck script times out as 503 without hanging", async () => {
		const started = Date.now();
		const error = await runBridge(join(fixtures, "bridge_sleep.py"), {}, { timeoutMs: 500 }).catch(
			(error: unknown) => error,
		);
		expect(Date.now() - started).toBeLessThan(10000);
		expect(error).toBeInstanceOf(DomainError);
		expect((error as DomainError).code).toBe("calendar_domain_unavailable");
		expect((error as DomainError).status).toBe(503);
	});

	test("a child ignoring SIGTERM is escalated to SIGKILL", async () => {
		const started = Date.now();
		const error = await runBridge(join(fixtures, "bridge_ignore_term.py"), {}, { timeoutMs: 500 }).catch(
			(error: unknown) => error,
		);
		expect(Date.now() - started).toBeLessThan(10000);
		expect(error).toBeInstanceOf(DomainError);
		expect((error as DomainError).status).toBe(503);
	});

	test("stderr floods do not block a normal completion", async () => {
		const result = await runBridge<{ ok: boolean }>(
			join(fixtures, "bridge_stderr_flood.py"),
			{},
			{ timeoutMs: 15000 },
		);
		expect(result).toEqual({ ok: true });
	});

	test("missing interpreters and bad scripts map to 503", async () => {
		const missing = await runBridge(join(fixtures, "no-such-bridge.py"), {}, {}).catch(
			(error: unknown) => error,
		);
		expect(missing).toBeInstanceOf(DomainError);
		expect((missing as DomainError).status).toBe(503);
	});
});
