import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSourceStrong } from "../../../../shared/greekBesorah";
import {
	contextualRelationships,
	createContextualRelationships,
	formatRelatedReference,
	type Language,
	type RelatedGlossSource,
	verseRef,
	verseRefFromDisplayId,
} from "../../../../shared/contextualRelationships";

const repoPath = (path: string) =>
	resolve(import.meta.dir, "../../../..", path);
const readJson = <T>(path: string): T =>
	JSON.parse(readFileSync(repoPath(path), "utf8")) as T;

type ShippedRecord = {
	id: string;
	source: { strong: string; lemma: string };
	target: { strong: string; lemma: string };
	rationale: { es: string };
	attribution: { credit: string };
	provenance: { path: string; json_pointer: string };
	review: { status: string };
};

const shipped = readJson<{ relationships: ShippedRecord[] }>(
	"shared/contextualRelationships.json",
).relationships[0];

const JOHN_1_1 = { book_id: "john", chapter: 1, verse: 1 };
const LANGUAGES: Language[] = ["en", "es", "he"];
const RATIONALE = "Fixture rationale, not a scholarly claim.";

const scopeVerse = (book_id: string, chapter: number, verse: number) => ({
	system_id: "davar-v1",
	kind: "verse",
	book_id,
	chapter,
	verse,
});

const approved = {
	status: "approved",
	reviewer: { name: "Fixture Reviewer" },
	reviewed_on: "2026-01-01",
};

const fixture = (overrides: Record<string, unknown> = {}) => ({
	id: "fixture-g3056-h1697-john-1-1",
	predicate: "contextually_related_to",
	source: {
		language: "greek",
		strong: "G3056",
		lemma: "fixture-greek-lemma",
		transliteration: "fixture-greek",
	},
	target: {
		language: "hebrew",
		strong: "H1697",
		lemma: "fixture-hebrew-lemma",
		transliteration: "fixture-hebrew",
	},
	scope: [scopeVerse("john", 1, 1)],
	rationale: { es: RATIONALE },
	attribution: { credit: "Fixture credit", locator: "Fixture locator" },
	provenance: {
		source_id: "fixture",
		path: "fixture.json",
		json_pointer: "/fixture",
		origin: "authored",
		transformation: "imported",
	},
	review: approved,
	...overrides,
});

const side = (language: "greek" | "hebrew", strong: string) => ({
	language,
	strong,
	lemma: `fixture-lemma-${strong}`,
	transliteration: `fixture-translit-${strong}`,
});

const catalog = (...relationships: unknown[]) =>
	createContextualRelationships({
		schema: "davar-contextual-relationships-v1",
		relationships,
	});

const glossOf = (gloss: string | null) =>
	mock<RelatedGlossSource>(async () => gloss);

describe("shipped relationship", () => {
	test("parses without issues and claims no reviewer", () => {
		expect(contextualRelationships.issues).toEqual([]);
		expect(shipped.review).toEqual({ status: "unreviewed" });
	});

	test("renders nowhere and never asks for a gloss", async () => {
		const gloss = glossOf("Fixture gloss");
		for (const language of LANGUAGES) {
			for (const strong of ["G3056", "Hd/H1697"]) {
				expect(
					await contextualRelationships.loadRelated(
						{ strong, verse: JOHN_1_1, language },
						gloss,
					),
				).toEqual([]);
			}
		}
		expect(gloss).not.toHaveBeenCalled();
	});

	test("rationale is the source footnote verbatim", () => {
		const source = readJson<unknown>(shipped.provenance.path);
		const footnote = shipped.provenance.json_pointer
			.split("/")
			.slice(1)
			.reduce<unknown>(
				(node, key) => (node as Record<string, unknown>)[key],
				source,
			) as { explanation: string };
		expect(footnote.explanation).toBe(shipped.rationale.es);
	});

	test("attribution and labels are grounded in the repo", () => {
		expect(readFileSync(repoPath("README.md"), "utf8")).toContain(
			shipped.attribution.credit,
		);
		const word = readJson<{ lemma: string }>(
			"data/dict/lexicon/words/H1697.json",
		);
		expect(word.lemma).toBe(shipped.target.lemma);
		const custom = readJson<
			Record<string, { definitions: Array<{ term?: string }> }>
		>("data/dict/lexicon/custom_definitions.json");
		expect(
			custom.G3056.definitions.some(
				(row) => row.term === shipped.source.lemma,
			),
		).toBe(true);
	});

	test("the scope is reachable from both texts", () => {
		const delitzsch = readJson<
			Array<{
				verses: Array<{ verse: number; words: Array<{ strong?: string }> }>;
			}>
		>("data/delitzsch/parsed/john/1.json");
		const hebrewVerse = delitzsch[0].verses.find((verse) => verse.verse === 1);
		expect(
			hebrewVerse?.words.some(
				(word) => parseSourceStrong(word.strong) === shipped.target.strong,
			),
		).toBe(true);

		const manifest = readJson<{ parts: { john: { path: string } } }>(
			"data/greek/preview/greek-sblgnt.json",
		);
		const greek = readJson<{
			chapters: Record<
				string,
				Array<{ verse: number; words: Array<{ strong: string }> }>
			>;
		}>(`data/greek/preview/${manifest.parts.john.path}`);
		const greekVerse = greek.chapters["1"].find((verse) => verse.verse === 1);
		expect(
			greekVerse?.words.some((word) => word.strong === shipped.source.strong),
		).toBe(true);
	});

	test("definitions stayed on their own identities", () => {
		const custom = readJson<
			Record<string, { definitions: Array<{ term_language?: string }> }>
		>("data/dict/lexicon/custom_definitions.json");
		expect(
			custom.G3056.definitions.every((row) => row.term_language === "greek"),
		).toBe(true);
		expect(
			custom.H1697.definitions.some((row) => row.term_language === "greek"),
		).toBe(false);
	});
});

describe("fixture relationships", () => {
	test("an approved record resolves in both directions and from a prefixed token", async () => {
		const related = catalog(fixture());
		expect(related.issues).toEqual([]);
		const fromGreek = await related.loadRelated(
			{ strong: "G3056", verse: JOHN_1_1, language: "es" },
			glossOf("Fixture gloss"),
		);
		expect(fromGreek).toEqual([
			{
				id: "fixture-g3056-h1697-john-1-1",
				related: {
					language: "hebrew",
					strong: "H1697",
					lemma: "fixture-hebrew-lemma",
					transliteration: "fixture-hebrew",
					gloss: "Fixture gloss",
				},
				reference: JOHN_1_1,
				rationale: RATIONALE,
				credit: "Fixture credit",
				locator: "Fixture locator",
				reviewer: "Fixture Reviewer",
			},
		]);
		for (const strong of ["H1697", "Hd/H1697", "Hc/Hd/H1697"]) {
			const [entry] = await related.loadRelated(
				{ strong, verse: JOHN_1_1, language: "es" },
				glossOf("Fixture gloss"),
			);
			expect(entry.related.strong).toBe("G3056");
		}
	});

	test("several results sort by id and the model is not tied to one verse", async () => {
		const later = fixture({
			id: "fixture-z-shared-word",
			source: side("greek", "G9901"),
			target: side("hebrew", "H9902"),
		});
		const earlier = fixture({
			id: "fixture-a-two-verses",
			source: side("greek", "G9901"),
			target: side("hebrew", "H9901"),
			scope: [scopeVerse("john", 1, 1), scopeVerse("mark", 2, 3)],
		});
		const separate = fixture({
			id: "fixture-m-separate",
			source: side("greek", "G9902"),
			target: side("hebrew", "H9903"),
			scope: [scopeVerse("genesis", 1, 1)],
		});
		const related = catalog(later, separate, earlier);
		expect(related.issues).toEqual([]);
		const hits = await related.loadRelated(
			{ strong: "G9901", verse: JOHN_1_1, language: "es" },
			glossOf("Fixture gloss"),
		);
		expect(hits.map((entry) => entry.id)).toEqual([
			"fixture-a-two-verses",
			"fixture-z-shared-word",
		]);
		const mark = await related.loadRelated(
			{
				strong: "H9901",
				verse: { book_id: "mark", chapter: 2, verse: 3 },
				language: "es",
			},
			glossOf("Fixture gloss"),
		);
		expect(mark.map((entry) => entry.related.strong)).toEqual(["G9901"]);
		const genesis = await related.loadRelated(
			{
				strong: "G9902",
				verse: { book_id: "genesis", chapter: 1, verse: 1 },
				language: "es",
			},
			glossOf("Fixture gloss"),
		);
		expect(genesis.map((entry) => entry.id)).toEqual(["fixture-m-separate"]);
	});

	test("scope is exact", async () => {
		const related = catalog(fixture());
		const gloss = glossOf("Fixture gloss");
		for (const verse of [
			{ book_id: "john", chapter: 1, verse: 2 },
			{ book_id: "mark", chapter: 1, verse: 1 },
			null,
		]) {
			expect(
				await related.loadRelated(
					{ strong: "G3056", verse, language: "es" },
					gloss,
				),
			).toEqual([]);
		}
		expect(gloss).not.toHaveBeenCalled();
	});

	test("a missing gloss or rationale omits the entry with no language fallback", async () => {
		const related = catalog(fixture());
		const selection = {
			strong: "G3056",
			verse: JOHN_1_1,
			language: "es" as const,
		};
		expect(await related.loadRelated(selection, glossOf(null))).toEqual([]);
		expect(await related.loadRelated(selection, glossOf("   "))).toEqual([]);
		expect(
			await related.loadRelated(selection, async () => {
				throw new Error("fixture failure");
			}),
		).toEqual([]);
		for (const language of ["en", "he"] as const) {
			const gloss = glossOf("Fixture gloss");
			expect(
				await related.loadRelated({ ...selection, language }, gloss),
			).toEqual([]);
			expect(gloss).not.toHaveBeenCalled();
		}
	});

	test("padding is identity and a letter suffix is not", async () => {
		const padded = catalog(
			fixture({
				id: "fixture-padded",
				source: side("greek", "G0007"),
				target: side("hebrew", "H9907"),
			}),
		);
		const hits = await padded.loadRelated(
			{ strong: "G7", verse: JOHN_1_1, language: "es" },
			glossOf("Fixture gloss"),
		);
		expect(hits.map((entry) => entry.id)).toEqual(["fixture-padded"]);
		const gloss = glossOf("Fixture gloss");
		expect(
			await catalog(fixture()).loadRelated(
				{ strong: "G3056G", verse: JOHN_1_1, language: "es" },
				gloss,
			),
		).toEqual([]);
		expect(gloss).not.toHaveBeenCalled();
	});

	const invalidRecords: Array<[string, Record<string, unknown>]> = [
		[
			"approved without reviewer",
			{ review: { status: "approved", reviewed_on: "2026-01-01" } },
		],
		["blank reviewer", { review: { ...approved, reviewer: { name: "  " } } }],
		[
			"unreviewed with reviewer",
			{ review: { status: "unreviewed", reviewer: { name: "Fixture Reviewer" } } },
		],
		[
			"rejected without reviewer",
			{ review: { status: "rejected", reviewed_on: "2026-01-01" } },
		],
		["unknown status", { review: { ...approved, status: "pending" } }],
		["D id", { target: side("hebrew", "D1697") }],
		["namespace mismatch", { target: side("hebrew", "G1697") }],
		["same-language pair", { target: side("greek", "G9901") }],
		["unpadded Greek", { source: side("greek", "G746") }],
		["padded Hebrew", { target: side("hebrew", "H01697") }],
		["extra definitions key", { definitions: ["fixture definition"] }],
		[
			"range scope",
			{ scope: [{ ...scopeVerse("john", 1, 1), kind: "range" }] },
		],
		["unknown book", { scope: [scopeVerse("fixture", 1, 1)] }],
		["empty scope", { scope: [] }],
		["empty rationale", { rationale: {} }],
	];

	test.each(invalidRecords)("%s lands in issues", async (_label, overrides) => {
		const related = catalog(fixture(overrides));
		expect(related.issues).toHaveLength(1);
		expect(related.issues[0].id).toBe("fixture-g3056-h1697-john-1-1");
		const gloss = glossOf("Fixture gloss");
		for (const strong of ["G3056", "H1697"]) {
			expect(
				await related.loadRelated(
					{ strong, verse: JOHN_1_1, language: "es" },
					gloss,
				),
			).toEqual([]);
		}
		expect(gloss).not.toHaveBeenCalled();
	});

	test("a well-formed rejected record never renders and is not a catalog fault", async () => {
		const related = catalog(
			fixture({ review: { ...approved, status: "rejected" } }),
		);
		expect(related.issues).toEqual([]);
		const gloss = glossOf("Fixture gloss");
		expect(
			await related.loadRelated(
				{ strong: "G3056", verse: JOHN_1_1, language: "es" },
				gloss,
			),
		).toEqual([]);
		expect(gloss).not.toHaveBeenCalled();
	});

	test("a malformed catalog fails closed", () => {
		for (const input of [null, {}, { schema: "other", relationships: [] }]) {
			expect(createContextualRelationships(input).issues).toHaveLength(1);
		}
	});

	const resolveIds = async (records: unknown[]) => {
		const related = catalog(...records);
		const hits = await related.loadRelated(
			{ strong: "G3056", verse: JOHN_1_1, language: "es" },
			glossOf("Fixture gloss"),
		);
		return {
			hits: hits.map((entry) => entry.id),
			issues: related.issues
				.map((issue) => `${issue.id}: ${issue.reason}`)
				.sort(),
		};
	};

	const unrelated = fixture({
		id: "fixture-unrelated",
		target: side("hebrew", "H1254"),
	});

	test("a repeated id renders neither copy in either input order", async () => {
		const pending = fixture({ review: { status: "unreviewed" } });
		const signed = fixture();
		const expected = {
			hits: ["fixture-unrelated"],
			issues: [
				"fixture-g3056-h1697-john-1-1: repeated id",
				"fixture-g3056-h1697-john-1-1: repeated id",
			],
		};
		expect(await resolveIds([pending, signed, unrelated])).toEqual(expected);
		expect(await resolveIds([unrelated, signed, pending])).toEqual(expected);
	});

	test("an approved and a rejected record on the same pair and verse render nothing in either input order", async () => {
		const signed = fixture({ id: "fixture-a" });
		const rejected = fixture({
			id: "fixture-b",
			source: side("hebrew", "H1697"),
			target: side("greek", "G3056"),
			review: { ...approved, status: "rejected" },
		});
		const expected = {
			hits: ["fixture-unrelated"],
			issues: [
				"fixture-a: overlaps fixture-b on the same Strong pair and verse",
				"fixture-b: overlaps fixture-a on the same Strong pair and verse",
			],
		};
		expect(await resolveIds([signed, rejected, unrelated])).toEqual(expected);
		expect(await resolveIds([unrelated, rejected, signed])).toEqual(expected);
	});

	test("verse references agree and reject malformed input", () => {
		expect(verseRef("John", 1, 1)).toEqual(JOHN_1_1);
		expect(verseRefFromDisplayId("john-1-1")).toEqual(JOHN_1_1);
		expect(verseRefFromDisplayId("john1-1-10")).toEqual({
			book_id: "john1",
			chapter: 1,
			verse: 10,
		});
		expect(formatRelatedReference(JOHN_1_1, "es")).toBe("Jn 1:1");
		expect(verseRef("Fixture", 1, 1)).toBeNull();
		expect(verseRef("John", 0, 1)).toBeNull();
		for (const id of ["1", "fixture-1-1", "john-1", "John-1-1", "", null]) {
			expect(verseRefFromDisplayId(id)).toBeNull();
		}
	});

	test("no definition text enters or mutates the catalog", async () => {
		const deepFreeze = <T>(value: T): T => {
			if (typeof value === "object" && value !== null) {
				Object.values(value).forEach(deepFreeze);
				Object.freeze(value);
			}
			return value;
		};
		const input = deepFreeze({
			schema: "davar-contextual-relationships-v1",
			relationships: [fixture()],
		});
		const snapshot = JSON.stringify(input);
		const related = createContextualRelationships(input);
		expect(related.issues).toEqual([]);
		const selection = deepFreeze({
			strong: "G3056",
			verse: JOHN_1_1,
			language: "es" as const,
		});

		const first = await related.loadRelated(
			selection,
			async () => "Fixture definition one",
		);
		expect(first[0].related.gloss).toBe("Fixture definition one");
		first[0].related.gloss = "Tampered";
		first[0].related.lemma = "Tampered";
		first[0].reference.chapter = 99;

		const second = await related.loadRelated(
			selection,
			async () => "Fixture definition two",
		);
		expect(second[0].related.gloss).toBe("Fixture definition two");
		expect(second[0].related.lemma).toBe("fixture-hebrew-lemma");
		expect(second[0].reference).toEqual(JOHN_1_1);
		expect(JSON.stringify(input)).toBe(snapshot);
		expect(JSON.stringify(related)).not.toContain("Fixture definition");
	});
});

describe("locale labels", () => {
	const KEYS = [
		"contextualRelation",
		"contextualRelationScope",
		"contextualRelationNote",
		"contextualRelationGreek",
		"contextualRelationHebrew",
		"contextualRelationWhy",
		"contextualRelationReviewedBy",
	];
	const PLACEHOLDERS: Record<string, string> = {
		contextualRelationScope: "{reference}",
		contextualRelationReviewedBy: "{reviewer}",
	};

	test.each(LANGUAGES)("%s defines every relationship label", (language) => {
		const { wordCard } = readJson<{ wordCard: Record<string, string> }>(
			`locales/${language}.json`,
		);
		for (const key of KEYS) {
			expect(wordCard[key]?.trim()).toBeTruthy();
			if (PLACEHOLDERS[key]) expect(wordCard[key]).toContain(PLACEHOLDERS[key]);
		}
	});
});
