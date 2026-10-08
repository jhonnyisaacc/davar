import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/http/app.js";
import { makeTestContext } from "./helper.js";

const ROUTES_RB = join(dirname(fileURLToPath(import.meta.url)), "../../api/config/routes.rb");

const VERBS: Record<string, string> = {
	get: "GET",
	post: "POST",
	patch: "PATCH",
	put: "PUT",
	delete: "DELETE",
};

const RESOURCE_ACTIONS: Record<string, Array<{ method: string; suffix: string }>> = {
	index: [{ method: "GET", suffix: "" }],
	create: [{ method: "POST", suffix: "" }],
	show: [{ method: "GET", suffix: "/:id" }],
	update: [
		{ method: "PATCH", suffix: "/:id" },
		{ method: "PUT", suffix: "/:id" },
	],
	destroy: [{ method: "DELETE", suffix: "/:id" }],
};

interface Scope {
	kind: "if" | "namespace" | "resource" | "member";
	prefix: string;
}

function stripComment(raw: string): string {
	let quoted = false;
	for (let index = 0; index < raw.length; index += 1) {
		const char = raw[index];
		if (char === '"') quoted = !quoted;
		if (char === "#" && !quoted) return raw.slice(0, index);
	}
	return raw;
}

function joinPath(base: string, path: string): string {
	const left = base.endsWith("/") ? base.slice(0, -1) : base;
	const right = path.startsWith("/") ? path : `/${path}`;
	const combined = `${left}${right}`.replace(/\/+/g, "/");
	return combined.startsWith("/") ? combined : `/${combined}`;
}

export function parseRailsRoutes(source: string): Array<{ method: string; path: string }> {
	const routes: Array<{ method: string; path: string }> = [];
	const stack: Scope[] = [];
	let closedDraw = false;
	const prefix = () => stack[stack.length - 1]?.prefix ?? "";

	for (const raw of source.split("\n")) {
		const line = stripComment(raw).trim();
		if (!line) continue;
		if (/^Rails\.application\.routes\.draw\b/.test(line)) continue;
		if (/^if\b/.test(line)) {
			stack.push({ kind: "if", prefix: prefix() });
			continue;
		}
		if (/^end\b/.test(line)) {
			if (stack.length === 0) {
				if (closedDraw) throw new Error("routes.rb has an extra end");
				closedDraw = true;
				continue;
			}
			stack.pop();
			continue;
		}
		const namespace = line.match(/^namespace\s+:(\w+)\s+do\b/);
		if (namespace?.[1]) {
			stack.push({ kind: "namespace", prefix: joinPath(prefix(), namespace[1]) });
			continue;
		}
		const resources = line.match(/^resources\s+:(\w+),\s+only:\s+\[([^\]]+)\](?:\s+do)?\s*$/);
		if (resources?.[1] && resources[2]) {
			const base = joinPath(prefix(), resources[1]);
			const actions = resources[2].split(",").map((part) => part.trim().replace(/^:/, ""));
			for (const action of actions) {
				const specs = RESOURCE_ACTIONS[action];
				if (!specs) throw new Error(`unknown resources action ${action}`);
				for (const spec of specs) {
					routes.push({ method: spec.method, path: `${base}${spec.suffix}` });
				}
			}
			if (/\bdo\s*$/.test(line)) stack.push({ kind: "resource", prefix: base });
			continue;
		}
		if (/^member\s+do\b/.test(line)) {
			const resource = [...stack].reverse().find((frame) => frame.kind === "resource");
			if (!resource) throw new Error("member block outside resources");
			stack.push({ kind: "member", prefix: `${resource.prefix}/:id` });
			continue;
		}
		const match = line.match(/^match\s+"([^"]+)",.*\bvia:\s+\[([^\]]+)\]/);
		if (match?.[1] && match[2]) {
			const path = joinPath(prefix(), match[1]);
			for (const via of match[2].split(",").map((part) => part.trim().replace(/^:/, ""))) {
				const method = VERBS[via];
				if (!method) throw new Error(`unknown match via ${via}`);
				routes.push({ method, path });
			}
			continue;
		}
		const quoted = line.match(/^(get|post|patch|put|delete)\s+"([^"]+)"/);
		if (quoted?.[1] && quoted[2]) {
			const method = VERBS[quoted[1]];
			if (!method) throw new Error(`unknown verb ${quoted[1]}`);
			routes.push({ method, path: joinPath(prefix(), quoted[2]) });
			continue;
		}
		const symbol = line.match(/^(get|post|patch|put|delete)\s+:(\w+)/);
		if (symbol?.[1] && symbol[2]) {
			const method = VERBS[symbol[1]];
			if (!method) throw new Error(`unknown verb ${symbol[1]}`);
			routes.push({ method, path: joinPath(prefix(), symbol[2]) });
			continue;
		}
		throw new Error(`unparsed routes.rb line: ${line}`);
	}
	if (!closedDraw || stack.length !== 0) throw new Error("routes.rb scopes were not closed");
	return routes;
}

function normalizePath(path: string): string {
	const stripped = path.replace(/\{[^}]*\}/g, "");
	return stripped.length > 1 && stripped.endsWith("/") ? stripped.slice(0, -1) : stripped;
}

describe("route parity with Rails", () => {
	test("every routes.rb route has a Hono handler with the same method and path", () => {
		const parsed = parseRailsRoutes(readFileSync(ROUTES_RB, "utf8"));
		expect(parsed).toHaveLength(47);
		expect(parsed).toEqual(
			expect.arrayContaining([
				{ method: "GET", path: "/up" },
				{ method: "GET", path: "/development/mailbox" },
				{ method: "GET", path: "/api/v1/development/status" },
				{ method: "GET", path: "/api/v1/auth/:provider/callback" },
				{ method: "POST", path: "/api/v1/auth/:provider/callback" },
				{ method: "PATCH", path: "/api/v1/assemblies/:id" },
				{ method: "PUT", path: "/api/v1/assemblies/:id" },
				{ method: "PATCH", path: "/api/v1/endorsements/:id" },
				{ method: "PUT", path: "/api/v1/endorsements/:id" },
				{ method: "PATCH", path: "/api/v1/account" },
				{ method: "PATCH", path: "/api/v1/account/city" },
			]),
		);
		const seen = new Set<string>();
		for (const route of parsed) {
			const key = `${route.method} ${route.path}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
		const { deps } = makeTestContext();
		const app = createApp(deps);
		const registered = new Set(
			app.routes
				.filter((route) => route.method !== "ALL")
				.map((route) => `${route.method} ${normalizePath(route.path)}`),
		);
		const missing = parsed.filter((route) => !registered.has(`${route.method} ${route.path}`));
		expect(missing).toEqual([]);
	});
});
