import { DomainError } from "../lib/errors.js";
import { signSelection, verifySelection } from "../lib/codec.js";
import { sandboxCities, sandboxEnabled, type SandboxCity } from "./sandbox.js";
import type { ProviderHttp } from "./oauth.js";
import { fetchHttp } from "./oauth.js";

export interface City extends SandboxCity {
	state?: string | null;
	selection: string;
}

const CITY_KINDS = new Set(["city", "town", "municipality", "village"]);

const searchCache = new Map<string, { expires: number; value: City[] }>();

export function clearCityCache(): void {
	searchCache.clear();
}

function roundCoordinate(value: number): number {
	return Math.round(value * 20) / 20;
}

export async function searchCities(
	query: unknown,
	input: {
		secret: string;
		sandbox: boolean;
		http?: ProviderHttp;
		env?: NodeJS.ProcessEnv;
	} = { secret: "", sandbox: false },
): Promise<City[]> {
	if (typeof query !== "string" || query.length < 2 || query.length > 100) {
		throw new DomainError("invalid_city_query");
	}
	if (input.sandbox || sandboxEnabled(input.env)) {
		return sandboxCities(query, input.secret);
	}
	const key = query.toLowerCase();
	const cached = searchCache.get(key);
	if (cached && cached.expires > Date.now()) return cached.value;
	const http = input.http ?? fetchHttp;
	const payload = (await http.json(
		`https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: "30" }).toString()}`,
	)) as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }> };
	const seen = new Set<string>();
	const cities: City[] = [];
	for (const feature of payload.features ?? []) {
		const properties = feature.properties ?? {};
		if (!CITY_KINDS.has(properties.osm_value as string)) continue;
		const coordinates = feature.geometry?.coordinates;
		if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;
		const [lon, lat] = coordinates as [unknown, unknown];
		if (typeof lon !== "number" || typeof lat !== "number") continue;
		const city = (properties.city as string) || (properties.name as string);
		const country = properties.country as string;
		if (!city || !country) continue;
		const dedupe = `${city}|${country}`;
		if (seen.has(dedupe)) continue;
		seen.add(dedupe);
		const data = {
			city,
			country,
			state: (properties.state as string) ?? null,
			latitude: roundCoordinate(lat),
			longitude: roundCoordinate(lon),
		};
		cities.push({
			...data,
			selection: await signSelection(data, input.secret),
		});
		if (cities.length >= 10) break;
	}
	searchCache.set(key, { expires: Date.now() + 24 * 60 * 60 * 1000, value: cities });
	return cities;
}

export async function resolveCitySelection(
	selection: unknown,
	secret: string,
): Promise<{ city: string; country?: string; state?: string | null; latitude: number; longitude: number }> {
	if (typeof selection !== "string") throw new DomainError("invalid_city_selection");
	try {
		return await verifySelection<{
			city: string;
			country?: string;
			state?: string | null;
			latitude: number;
			longitude: number;
		}>(selection, secret);
	} catch {
		throw new DomainError("invalid_city_selection");
	}
}
