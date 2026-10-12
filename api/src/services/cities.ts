import { DomainError } from "../lib/errors.js";
import { signSelections, verifySelection } from "../lib/codec.js";
import { sandboxCities, sandboxEnabled, type SandboxCity } from "./sandbox.js";
import type { ProviderHttp } from "./oauth.js";
import { fetchHttp } from "./oauth.js";

export interface CityPlace extends SandboxCity {
	state?: string | null;
}

export interface City extends CityPlace {
	selection: string;
}

const CITY_KINDS = new Set(["city", "town", "municipality", "village"]);
const PHOTON_TAGS = ["place:city", "place:town", "place:village"];

const searchCache = new Map<string, { expires: number; value: CityPlace[] }>();

export function clearCityCache(): void {
	searchCache.clear();
}

function roundCoordinate(value: number): number {
	return Math.round(value * 20) / 20;
}

export function cachedCitySearch(query: unknown): CityPlace[] | null {
	if (typeof query !== "string") return null;
	const cached = searchCache.get(query.toLowerCase());
	if (!cached || cached.expires <= Date.now()) return null;
	return cached.value;
}

function photonSearchUrl(query: string): string {
	const params = new URLSearchParams({ q: query, limit: "30" });
	for (const tag of PHOTON_TAGS) params.append("osm_tag", tag);
	return `https://photon.komoot.io/api/?${params.toString()}`;
}

async function signedCities(places: CityPlace[], secret: string): Promise<City[]> {
	const selections = await signSelections(
		places.map((place) => ({ ...place })),
		secret,
	);
	return places.map((place, index) => {
		const selection = selections[index];
		if (!selection) throw new DomainError("invalid_city_selection");
		return { ...place, selection };
	});
}

export async function searchCities(
	query: unknown,
	input: {
		secret: string;
		sandbox: boolean;
		http?: ProviderHttp;
		env?: NodeJS.ProcessEnv;
		sign?: boolean;
	} = { secret: "", sandbox: false },
): Promise<City[] | CityPlace[]> {
	if (typeof query !== "string" || query.length < 2 || query.length > 100) {
		throw new DomainError("invalid_city_query");
	}
	if (input.sandbox || sandboxEnabled(input.env)) {
		return sandboxCities(query, input.secret);
	}
	const key = query.toLowerCase();
	let places = cachedCitySearch(query);
	if (!places) {
		const http = input.http ?? fetchHttp;
		const payload = (await http.json(photonSearchUrl(query))) as {
			features?: Array<{
				properties?: Record<string, unknown>;
				geometry?: { coordinates?: unknown };
			}>;
		};
		const seen = new Set<string>();
		places = [];
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
			places.push({
				city,
				country,
				state: (properties.state as string) ?? null,
				latitude: roundCoordinate(lat),
				longitude: roundCoordinate(lon),
			});
			if (places.length >= 10) break;
		}
		searchCache.set(key, {
			expires: Date.now() + 24 * 60 * 60 * 1000,
			value: places,
		});
	}
	if (input.sign === false) return places;
	return signedCities(places, input.secret);
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
