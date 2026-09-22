import { describe, expect, test } from "bun:test";
import {
	getPrefixSegments,
	normalizeHebrew,
	normalizeHebrewDisplay,
	parseHebrewWord,
	removeMaqafForDisplay,
	removeSofPasukForDisplay,
	splitLeadingHebrewCluster,
	stripCantillation,
	stripMeteg,
	stripNikud,
} from "./hebrew";

describe("hebrew display helpers", () => {
	test("splits an explicit prefix marker and keeps the particle id", () => {
		expect(parseHebrewWord("בְּ/רֵאשִׁית")).toEqual({
			full: "בְּ/רֵאשִׁית",
			prefix: {
				text: "בְּ",
				particle: "Hb",
				meanings: {},
			},
			root: "רֵאשִׁית",
		});
	});

	test("extracts a prefix only when the requested id matches", () => {
		expect(getPrefixSegments("בְּרֵאשִׁית", ["Hb"])).toEqual({
			prefixes: ["בְּ"],
			root: "רֵאשִׁית",
		});
		expect(getPrefixSegments("בְּרֵאשִׁית", ["Hl"])).toEqual({
			prefixes: [],
			root: "בְּרֵאשִׁית",
		});
	});

	test("strips nikud, cantillation, and meteg without dropping letters", () => {
		const pointed = "בְּרֵאשִׁ֖ית";
		expect(stripNikud(pointed)).toBe("בראש֖ית");
		expect(stripCantillation(pointed)).toBe("בְּרֵאשִׁית");
		expect(stripMeteg("בֽ")).toBe("ב");
		expect(normalizeHebrew(pointed)).toBe("בראשית");
	});

	test("normalizes display separators and bidi controls", () => {
		expect(removeMaqafForDisplay("וַיְהִי־אוֹר")).toBe("וַיְהִי אוֹר");
		expect(removeSofPasukForDisplay("אוֹר׃")).toBe("אוֹר");
		expect(normalizeHebrewDisplay("א\u200Eב\u202Aג\u2066")).toBe("אבג");
		expect(splitLeadingHebrewCluster("בְּר")).toEqual({
			head: "ב",
			tail: "ְּר",
		});
	});
});
