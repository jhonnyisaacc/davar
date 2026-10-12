import { Hono } from "hono";
import { productCapabilities } from "../../services/capabilities.js";
import { currentUser } from "../auth.js";
import type { AppVariables } from "../deps.js";

export const capabilitiesRoutes = new Hono<{ Variables: AppVariables }>();

capabilitiesRoutes.get("/capabilities", async (c) => {
	const { db, config, env, flags, http } = c.get("deps");
	const user = await currentUser(db, config, c);
	return c.json(
		await productCapabilities(db, {
			userId: user?.id,
			env,
			nodeEnv: env.NODE_ENV ?? "development",
			flags,
			http,
		}),
	);
});
