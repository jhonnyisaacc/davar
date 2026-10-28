import { describe, expect, test } from "bun:test";
import {
	formatDefinitionMeaningForDisplay,
	isDetailDefinition,
	partitionDefinitionMeanings,
	sanitizePaganDeityCapitalization,
	structureDefinitionMeanings,
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

describe("sanitizePaganDeityCapitalization", () => {
	test("demotes Spanish Dioses / Diosas / Diosa and Dios pagano", () => {
		expect(sanitizePaganDeityCapitalization("Dioses")).toBe("dioses");
		expect(sanitizePaganDeityCapitalization("Diosas de las naciones")).toBe(
			"diosas de las naciones",
		);
		expect(sanitizePaganDeityCapitalization("Diosa; Artemisa")).toBe(
			"diosa; Artemisa",
		);
		expect(sanitizePaganDeityCapitalization("un Dios pagano")).toBe(
			"un dios pagano",
		);
		expect(sanitizePaganDeityCapitalization("Dios pagana")).toBe(
			"dios pagana",
		);
	});

	test("preserves theological Dios / God", () => {
		expect(sanitizePaganDeityCapitalization("Dios")).toBe("Dios");
		expect(sanitizePaganDeityCapitalization("el (verdadero) Dios")).toBe(
			"el (verdadero) Dios",
		);
		expect(sanitizePaganDeityCapitalization("God")).toBe("God");
		expect(sanitizePaganDeityCapitalization("works of God")).toBe(
			"works of God",
		);
	});

	test("English parallel demotes Gods / Goddess without touching God", () => {
		expect(sanitizePaganDeityCapitalization("Gods")).toBe("gods");
		expect(sanitizePaganDeityCapitalization("Goddess")).toBe("goddess");
		expect(sanitizePaganDeityCapitalization("a pagan God")).toBe(
			"a pagan god",
		);
		expect(sanitizePaganDeityCapitalization("God")).toBe("God");
	});
});

describe("formatDefinitionMeaningForDisplay", () => {
	test("sentence-cases then demotes capitalized dioses from BDB lowercase", () => {
		// First-letter capitalize would yield "Dioses"; sanitizer demotes it.
		expect(formatDefinitionMeaningForDisplay("dioses")).toBe("dioses");
		expect(formatDefinitionMeaningForDisplay("diosa")).toBe("diosa");
		expect(formatDefinitionMeaningForDisplay("gods")).toBe("gods");
	});

	test("keeps theological God / Dios after sentence case", () => {
		expect(formatDefinitionMeaningForDisplay("Dios")).toBe("Dios");
		expect(formatDefinitionMeaningForDisplay("God")).toBe("God");
		expect(formatDefinitionMeaningForDisplay("rulers")).toBe("Rulers");
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
			isDetailDefinition({
				text: "word",
				source: "stepbible-tbesg",
				role: "fuller",
			}),
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

describe("structureDefinitionMeanings", () => {
	test("H430: custom gloss; BDB as senses; Eric as study", () => {
		const structured = structureDefinitionMeanings([
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

		expect(structured.gloss.map((item) => item.text)).toEqual([
			"MIGHTY ONE (majestic plural)",
			"Creator of the world",
		]);
		expect(structured.senses.map((item) => item.text)).toEqual([
			"rulers",
			"judges",
			"God",
		]);
		expect(structured.study.map((item) => item.source)).toContain(
			"tcysite-eric",
		);
		expect(structured.fuller).toEqual([]);
		expect(structured.primary).toEqual(structured.gloss);
	});

	test("Hebrew without custom: first BDB is gloss; rest are senses", () => {
		const structured = structureDefinitionMeanings([
			{ text: "rulers", source: "bdb", sense: "1a" },
			{ text: "judges", source: "bdb", sense: "1a" },
			{ text: "gods", source: "bdb", sense: "1d" },
		]);

		expect(structured.gloss.map((item) => item.text)).toEqual(["rulers"]);
		expect(structured.senses.map((item) => item.text)).toEqual([
			"judges",
			"gods",
		]);
	});

	test("G3056 Spanish: gloss order; detail in study; fuller separate", () => {
		const structured = structureDefinitionMeanings([
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

		expect(structured.gloss.map((item) => item.source)).toEqual([
			"tcysite-eric",
			"tcysite-greek-strong",
			"tcysite-greek-master",
			"stepbible-tbesg",
		]);
		expect(structured.fuller).toHaveLength(1);
		expect(structured.fuller[0]?.role).toBe("fuller");
		expect(
			structured.study.some((item) => item.source === "tcysite-greek-detail"),
		).toBe(true);
		expect(structured.gloss.some((item) => item.role === "fuller")).toBe(
			false,
		);
	});

	test("G2424G: short gloss; fuller bucket", () => {
		const structured = structureDefinitionMeanings([
			{ text: "Jesus", source: "stepbible-tbesg", role: "short" },
			{
				text: "Ἰησοῦς … long essay",
				source: "stepbible-tbesg",
				role: "fuller",
			},
		]);

		expect(structured.gloss.map((item) => item.text)).toEqual(["Jesus"]);
		expect(structured.fuller).toHaveLength(1);
		expect(structured.secondary).toHaveLength(1);
	});

	test("fallback promotes least-bad when gloss would be empty", () => {
		const structured = structureDefinitionMeanings([
			{
				text: "only detail left",
				source: "tcysite-greek-detail",
				definition_kind: "lexical_detail",
			},
		]);

		expect(structured.gloss.map((item) => item.text)).toEqual([
			"only detail left",
		]);
		expect(structured.study).toEqual([]);
	});
});

describe("partitionDefinitionMeanings", () => {
	test("primary/secondary mirror structured gloss/secondary", () => {
		const input = [
			{ text: "Jesus", source: "stepbible-tbesg", role: "short" as const },
			{
				text: "long",
				source: "stepbible-tbesg",
				role: "fuller" as const,
			},
		];
		const partitioned = partitionDefinitionMeanings(input);
		const structured = structureDefinitionMeanings(input);
		expect(partitioned.primary).toEqual(structured.primary);
		expect(partitioned.secondary).toEqual(structured.secondary);
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
