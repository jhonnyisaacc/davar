import { describe, expect, test } from "bun:test";
import {
	isDetailDefinition,
	partitionDefinitionMeanings,
	stripDefinitionControls,
} from "./definitionMeanings";

describe("stripDefinitionControls", () => {
	test("removes BiDi embedding and isolate marks", () => {
		const raw = `hola \u202Bשלום\u202C mundo\u200E`;
		expect(stripDefinitionControls(raw)).toBe("hola שלום mundo");
	});

	test("removes zero-width and BOM characters", () => {
		expect(stripDefinitionControls("a\u200Bb\uFEFFc")).toBe("abc");
	});
});

describe("isDetailDefinition", () => {
	test("flags tcysite-greek-detail and lexical_detail", () => {
		expect(
			isDetailDefinition({
				text: "long",
				source: "tcysite-greek-detail",
			}),
		).toBe(true);
		expect(
			isDetailDefinition({
				text: "long",
				source: "custom",
				definition_kind: "lexical_detail",
			}),
		).toBe(true);
		expect(
			isDetailDefinition({ text: "word", source: "stepbible-tbesg", role: "fuller" }),
		).toBe(true);
		expect(
			isDetailDefinition({
				text: "word",
				source: "stepbible-tbesg",
				role: "short",
			}),
		).toBe(false);
	});
});

describe("partitionDefinitionMeanings", () => {
	test("H430: custom wins; BDB fragments move to secondary", () => {
		const { primary, secondary } = partitionDefinitionMeanings([
			{
				text: "MIGHTY ONE (majestic plural)",
				source: "custom",
			},
			{ text: "Creator of the world", source: "custom" },
			{ text: "rulers", source: "bdb", sense: "1a" },
			{ text: "judges", source: "bdb", sense: "1a" },
			{ text: "God", source: "bdb", sense: "2d" },
			{
				text: "Dios",
				source: "tcysite-eric",
				definition_kind: "definition",
			},
		]);

		expect(primary.map((item) => item.text)).toEqual([
			"MIGHTY ONE (majestic plural)",
			"Creator of the world",
		]);
		expect(secondary.map((item) => item.text)).toContain("rulers");
		expect(secondary.map((item) => item.text)).toContain("judges");
		expect(secondary.map((item) => item.text)).toContain("Dios");
	});

	test("Hebrew without custom keeps only the first BDB fragment primary", () => {
		const { primary, secondary } = partitionDefinitionMeanings([
			{ text: "rulers", source: "bdb", sense: "1a" },
			{ text: "judges", source: "bdb", sense: "1a" },
			{ text: "gods", source: "bdb", sense: "1d" },
		]);

		expect(primary.map((item) => item.text)).toEqual(["rulers"]);
		expect(secondary.map((item) => item.text)).toEqual(["judges", "gods"]);
	});

	test("G3056 Spanish: demotes detail and fuller; prefers Eric then strong then TBESG short", () => {
		const { primary, secondary } = partitionDefinitionMeanings([
			{
				text: "λüγος dump…",
				source: "tcysite-greek-detail",
				definition_kind: "lexical_detail",
			},
			{
				text: "palabra, corporeidad de Dios",
				source: "tcysite-eric",
			},
			{
				text: "algo dicho",
				source: "tcysite-greek-strong",
			},
			{
				text: "Palabra, dicho, mensaje",
				source: "tcysite-greek-master",
			},
			{
				text: "Palabra",
				source: "stepbible-tbesg",
				role: "short",
			},
			{
				text: "long scholarly fuller…",
				source: "stepbible-tbesg",
				role: "fuller",
			},
		]);

		expect(primary.map((item) => item.source)).toEqual([
			"tcysite-eric",
			"tcysite-greek-strong",
			"tcysite-greek-master",
			"stepbible-tbesg",
		]);
		expect(primary[0]?.text).toBe("palabra, corporeidad de Dios");
		expect(secondary.map((item) => item.role)).toContain("fuller");
		expect(
			secondary.some((item) => item.source === "tcysite-greek-detail"),
		).toBe(true);
		expect(primary.some((item) => item.role === "fuller")).toBe(false);
	});

	test("G2424G: short stays primary when fuller is present", () => {
		const { primary, secondary } = partitionDefinitionMeanings([
			{ text: "Jesus", source: "stepbible-tbesg", role: "short" },
			{
				text: "Ἰησοῦς … long essay",
				source: "stepbible-tbesg",
				role: "fuller",
			},
		]);

		expect(primary.map((item) => item.text)).toEqual(["Jesus"]);
		expect(secondary).toHaveLength(1);
		expect(secondary[0]?.role).toBe("fuller");
	});

	test("fallback promotes least-bad secondary when primary would be empty", () => {
		const { primary, secondary } = partitionDefinitionMeanings([
			{
				text: "only detail left",
				source: "tcysite-greek-detail",
				definition_kind: "lexical_detail",
			},
		]);

		expect(primary.map((item) => item.text)).toEqual(["only detail left"]);
		expect(secondary).toEqual([]);
	});

	test("strips BiDi before partitioning", () => {
		const { primary } = partitionDefinitionMeanings([
			{
				text: `word\u202B`,
				source: "stepbible-tbesg",
				role: "short",
			},
		]);
		expect(primary[0]?.text).toBe("word");
	});
});
