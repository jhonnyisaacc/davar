import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../lib/config.js";
import { hostAllowed } from "../lib/hosts.js";

export function hostAllowlist(input: {
	env: AppEnv;
	allowedHosts: readonly string[];
}): MiddlewareHandler {
	return async (c, next) => {
		if (hostAllowed(c.req.header("host"), input.allowedHosts, input.env)) {
			await next();
			return;
		}
		return c.json({ error: { code: "forbidden_host" } }, 403);
	};
}
