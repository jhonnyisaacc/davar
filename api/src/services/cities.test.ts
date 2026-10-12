import { beforeEach, describe, expect, test } from "bun:test";
import { verifySelection } from "../lib/codec.js";
import {
	cachedCitySearch,
	clearCityCache,
	searchCities,
	type City,
} from "./cities.js";
import type { ProviderHttp } from "./oauth.js";

const SECRET = "city-search-test-secret";

function feature(
	osmValue: string,
	name: string,
	coordinates: [number, number] = [10, 20],
) {
	return {
		properties: {
			osm_value: osmValue,
			name,
			city: name,
			country: "Testland",
			state: "State",
		},
		geometry: { coordinates },
	};
}

function http(
	features: ReturnType<typeof feature>[],
	delayMs = 0,
): { client: ProviderHttp; urls: string[] } {
	const urls: string[] = [];
	return {
		urls,
		client: {
			async json(url: string) {
				urls.push(url);
				if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
				return { features };
			},
		},
	};
}

beforeEach(clearCityCache);

describe("searchCities", () => {
	test("asks Photon only for cities, towns, and villages", async () => {
		const photon = http([
			feature("city", "Ada"),
			feature("village", "Eden", [11, 21]),
			feature("hamlet", "Camp", [12, 22]),
			feature("city", "Ada", [10.2, 20.2]),
		]);
		const places = await searchCities("Ada", {
			secret: SECRET,
			sandbox: false,
			http: photon.client,
			sign: false,
		});
		expect(photon.urls).toHaveLength(1);
		const url = new URL(photon.urls[0] ?? "");
		expect(url.searchParams.getAll("osm_tag")).toEqual([
			"place:city",
			"place:town",
			"place:village",
		]);
		expect(places).toEqual([
			{
				city: "Ada",
				country: "Testland",
				state: "State",
				latitude: 20,
				longitude: 10,
			},
			{
				city: "Eden",
				country: "Testland",
				state: "State",
				latitude: 21,
				longitude: 11,
			},
		]);
		expect(places[0]).not.toHaveProperty("selection");
	});

	test("a repeated query is served from memory and can be signed together", async () => {
		const photon = http([feature("town", "Ada")], 180);
		const firstStarted = Date.now();
		const first = (await searchCities("ada", {
			secret: SECRET,
			sandbox: false,
			http: photon.client,
			sign: true,
		})) as City[];
		const firstMs = Date.now() - firstStarted;
		expect(photon.urls).toHaveLength(1);
		expect(cachedCitySearch("Ada")?.map((place) => place.city)).toEqual(["Ada"]);

		const repeatStarted = Date.now();
		const repeat = (await searchCities("ADA", {
			secret: SECRET,
			sandbox: false,
			http: photon.client,
			sign: true,
		})) as City[];
		const repeatMs = Date.now() - repeatStarted;
		expect(photon.urls).toHaveLength(1);
		expect(repeatMs).toBeLessThan(firstMs);
		expect(repeat[0]?.city).toBe("Ada");
		expect(
			await verifySelection(first[0]?.selection ?? "", SECRET),
		).toMatchObject({ city: "Ada", country: "Testland" });
		expect(
			await verifySelection(repeat[0]?.selection ?? "", SECRET),
		).toMatchObject({ city: "Ada", country: "Testland" });
	});
});
