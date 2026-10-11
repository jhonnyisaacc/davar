import { Hono, type Context } from "hono";
import { biblicalCalendar } from "../../services/calendar.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { cachedCitySearch, searchCities } from "../../services/cities.js";
import { sandboxEnabled } from "../../services/sandbox.js";
import { DomainError } from "../../lib/errors.js";
import { clientIp } from "../auth.js";
import type { AppVariables } from "../deps.js";

type AppContext = Context<{ Variables: AppVariables }>;

export const calendarRoutes = new Hono<{ Variables: AppVariables }>();

calendarRoutes.get("/calendar/locations", async (c) => {
	const { db, config, env } = c.get("deps");
	const query = c.req.query().q;
	if (cachedCitySearch(query) === null) {
		await checkRateLimit(db, `calendar_city/${clientIp(c)}`, 10);
	}
	if (typeof query !== "string") throw new DomainError("invalid_city_query");
	const cities = await searchCities(query, {
		secret: config.encryptionDeterministicKey,
		sandbox: sandboxEnabled(env, env.NODE_ENV ?? "development"),
		env,
		sign: false,
	});
	return c.json({
		cities: cities.map((city) => {
			if (!("selection" in city)) return city;
			const { selection: _selection, ...rest } = city;
			return rest;
		}),
	});
});

async function calendarResult(c: AppContext, count: number) {
	const { db, env } = c.get("deps");
	await checkRateLimit(db, `calendar/${clientIp(c)}`, 30);
	const params = c.req.query();
	return c.json(
		await biblicalCalendar(
			db,
			{
				instant: params.instant ?? new Date().toISOString(),
				latitude: params.latitude,
				longitude: params.longitude,
				timezone: params.timezone,
				count,
				refreshSource: params.refresh !== "0",
			},
			{ env, nodeEnv: env.NODE_ENV ?? "development" },
		),
	);
}

calendarRoutes.get("/calendar/today", (c) => calendarResult(c, 1));

calendarRoutes.get("/calendar/upcoming", (c) => {
	const raw = c.req.query().days ?? "14";
	const days = Number(raw);
	if (!Number.isInteger(days)) throw new DomainError("invalid_calendar_range");
	return calendarResult(c, days);
});
