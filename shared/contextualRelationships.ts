import { BOOKS } from "./books";
import raw from "./contextualRelationships.json";
import { parseSourceStrong } from "./greekBesorah";

export type Language = "en" | "es" | "he";
export type VerseRef = { book_id: string; chapter: number; verse: number };

type LexicalSide = {
	language: "greek" | "hebrew";
	strong: string;
	lemma: string;
	transliteration: string;
};
type ReviewDecision = { reviewer: { name: string }; reviewed_on: string };
type Review =
	| { status: "unreviewed" }
	| ({ status: "approved" } & ReviewDecision)
	| ({ status: "rejected" } & ReviewDecision);
type Relationship = {
	id: string;
	predicate: "contextually_related_to";
	source: LexicalSide;
	target: LexicalSide;
	scope: readonly VerseRef[];
	rationale: Partial<Record<Language, string>>;
	attribution: { credit: string; locator: string };
	provenance: {
		source_id: string;
		path: string;
		json_pointer: string;
		origin: "source" | "authored";
		transformation: "extracted" | "imported";
	};
	review: Review;
};
type ApprovedRelationship = Relationship & {
	review: Extract<Review, { status: "approved" }>;
};

export type RelatedGlossSource = (
	strong: string,
	language: Language,
) => Promise<string | null>;
export type RelatedSelection = {
	strong: string | null | undefined;
	verse: VerseRef | null;
	language: Language;
};
export type ContextualRelatedEntry = {
	id: string;
	related: LexicalSide & { gloss: string };
	reference: VerseRef;
	rationale: string;
	credit: string;
	locator: string;
	reviewer: string;
};
export type CatalogIssue = { id: string | null; reason: string };
export type ContextualRelationships = {
	loadRelated(
		selection: RelatedSelection,
		glossSource: RelatedGlossSource,
	): Promise<ContextualRelatedEntry[]>;
	issues: readonly CatalogIssue[];
};

const SCHEMA = "davar-contextual-relationships-v1";
const LANGUAGES: readonly Language[] = ["en", "es", "he"];
const BOOK_IDS = new Set(BOOKS.map((book) => book.id));
const CANONICAL_STRONG = { greek: /^G\d{4}$/, hebrew: /^H[1-9]\d*$/ };

class InvalidRecord extends Error {}

const invalid = (reason: string): never => {
	throw new InvalidRecord(reason);
};

const exactObject = (
	value: unknown,
	keys: readonly string[],
	label: string,
): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return invalid(`${label} must be an object`);
	}
	const actual = Object.keys(value);
	const unexpected = actual.find((key) => !keys.includes(key));
	if (unexpected) return invalid(`${label} has unexpected key ${unexpected}`);
	const missing = keys.find((key) => !actual.includes(key));
	if (missing) return invalid(`${label} is missing ${missing}`);
	return value as Record<string, unknown>;
};

const text = (value: unknown, label: string): string =>
	typeof value === "string" && value.trim()
		? value
		: invalid(`${label} must be non-blank text`);

const oneOf = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	label: string,
): T =>
	allowed.includes(value as T)
		? (value as T)
		: invalid(`${label} must be one of ${allowed.join(", ")}`);

const isPositiveInteger = (value: unknown): value is number =>
	Number.isInteger(value) && (value as number) > 0;

const parseSide = (value: unknown, label: string): LexicalSide => {
	const side = exactObject(
		value,
		["language", "strong", "lemma", "transliteration"],
		label,
	);
	const language = oneOf(side.language, ["greek", "hebrew"], `${label}.language`);
	const strong = text(side.strong, `${label}.strong`);
	if (!CANONICAL_STRONG[language].test(strong)) {
		return invalid(`${label}.strong ${strong} is not a canonical ${language} Strong`);
	}
	return {
		language,
		strong,
		lemma: text(side.lemma, `${label}.lemma`),
		transliteration: text(side.transliteration, `${label}.transliteration`),
	};
};

const parseVerse = (value: unknown): VerseRef => {
	const scope = exactObject(
		value,
		["system_id", "kind", "book_id", "chapter", "verse"],
		"scope",
	);
	oneOf(scope.system_id, ["davar-v1"], "scope.system_id");
	oneOf(scope.kind, ["verse"], "scope.kind");
	const bookId = text(scope.book_id, "scope.book_id");
	if (!BOOK_IDS.has(bookId)) return invalid(`scope.book_id ${bookId} is unknown`);
	if (!isPositiveInteger(scope.chapter) || !isPositiveInteger(scope.verse)) {
		return invalid("scope chapter and verse must be positive integers");
	}
	return { book_id: bookId, chapter: scope.chapter, verse: scope.verse };
};

const verseKey = (verse: VerseRef): string =>
	`${verse.book_id}.${verse.chapter}.${verse.verse}`;

const parseScope = (value: unknown): VerseRef[] => {
	if (!Array.isArray(value) || value.length === 0) {
		return invalid("scope must list at least one verse");
	}
	const verses = value.map(parseVerse);
	if (new Set(verses.map(verseKey)).size !== verses.length) {
		return invalid("scope repeats a verse");
	}
	return verses;
};

const parseRationale = (value: unknown): Relationship["rationale"] => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return invalid("rationale must be an object");
	}
	const present = Object.keys(value);
	if (present.length === 0) return invalid("rationale is empty");
	const entries = present.map((key) => oneOf(key, LANGUAGES, "rationale key"));
	const source = value as Record<string, unknown>;
	return Object.fromEntries(
		LANGUAGES.filter((language) => entries.includes(language)).map(
			(language) => [language, text(source[language], `rationale.${language}`)],
		),
	);
};

const parseReview = (value: unknown): Review => {
	if (
		typeof value === "object" &&
		value !== null &&
		(value as { status?: unknown }).status === "unreviewed"
	) {
		exactObject(value, ["status"], "review");
		return { status: "unreviewed" };
	}
	const review = exactObject(
		value,
		["status", "reviewer", "reviewed_on"],
		"review",
	);
	const status = oneOf(review.status, ["approved", "rejected"], "review.status");
	const reviewer = exactObject(review.reviewer, ["name"], "review.reviewer");
	const reviewedOn = text(review.reviewed_on, "review.reviewed_on");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) {
		return invalid("review.reviewed_on must be YYYY-MM-DD");
	}
	return {
		status,
		reviewer: { name: text(reviewer.name, "review.reviewer.name") },
		reviewed_on: reviewedOn,
	};
};

const parseRelationship = (value: unknown): Relationship => {
	const record = exactObject(
		value,
		[
			"id",
			"predicate",
			"source",
			"target",
			"scope",
			"rationale",
			"attribution",
			"provenance",
			"review",
		],
		"record",
	);
	const source = parseSide(record.source, "source");
	const target = parseSide(record.target, "target");
	if (source.language === target.language) {
		return invalid("source and target must be in different languages");
	}
	const attribution = exactObject(
		record.attribution,
		["credit", "locator"],
		"attribution",
	);
	const provenance = exactObject(
		record.provenance,
		["source_id", "path", "json_pointer", "origin", "transformation"],
		"provenance",
	);
	return {
		id: text(record.id, "id"),
		predicate: oneOf(
			record.predicate,
			["contextually_related_to"],
			"predicate",
		),
		source,
		target,
		scope: parseScope(record.scope),
		rationale: parseRationale(record.rationale),
		attribution: {
			credit: text(attribution.credit, "attribution.credit"),
			locator: text(attribution.locator, "attribution.locator"),
		},
		provenance: {
			source_id: text(provenance.source_id, "provenance.source_id"),
			path: text(provenance.path, "provenance.path"),
			json_pointer: text(provenance.json_pointer, "provenance.json_pointer"),
			origin: oneOf(provenance.origin, ["source", "authored"], "provenance.origin"),
			transformation: oneOf(
				provenance.transformation,
				["extracted", "imported"],
				"provenance.transformation",
			),
		},
		review: parseReview(record.review),
	};
};

const rawId = (value: unknown): string | null => {
	const id = (value as { id?: unknown } | null | undefined)?.id;
	return typeof id === "string" && id.trim() ? id : null;
};

const compareRecords = (left: Relationship, right: Relationship): number =>
	left.id === right.id ? 0 : left.id < right.id ? -1 : 1;

const parseCatalog = (
	input: unknown,
): { records: Relationship[]; issues: CatalogIssue[] } => {
	const issues: CatalogIssue[] = [];
	const records: Relationship[] = [];
	const envelope = input as
		| { schema?: unknown; relationships?: unknown }
		| null
		| undefined;
	if (envelope?.schema !== SCHEMA || !Array.isArray(envelope.relationships)) {
		return {
			records,
			issues: [{ id: null, reason: `catalog must use schema ${SCHEMA}` }],
		};
	}
	for (const value of envelope.relationships) {
		try {
			records.push(parseRelationship(value));
		} catch (error) {
			if (!(error instanceof InvalidRecord)) throw error;
			issues.push({ id: rawId(value), reason: error.message });
		}
	}
	return { records: records.sort(compareRecords), issues };
};

const isApproved = (record: Relationship): record is ApprovedRelationship =>
	record.review.status === "approved";

const indexKey = (strong: string, verse: VerseRef): string =>
	`${strong}|${verseKey(verse)}`;

const pairKey = (record: Relationship, verse: VerseRef): string =>
	`${[record.source.strong, record.target.strong].sort().join("+")}|${verseKey(verse)}`;

const buildIndex = (
	records: readonly Relationship[],
	issues: CatalogIssue[],
): Map<string, ApprovedRelationship[]> => {
	const index = new Map<string, ApprovedRelationship[]>();
	const idCounts = new Map<string, number>();
	const pairIds = new Map<string, string[]>();
	const add = (key: string, record: ApprovedRelationship) => {
		index.set(key, [...(index.get(key) ?? []), record]);
	};
	for (const record of records) {
		idCounts.set(record.id, (idCounts.get(record.id) ?? 0) + 1);
		for (const verse of record.scope) {
			const pair = pairKey(record, verse);
			pairIds.set(pair, [...(pairIds.get(pair) ?? []), record.id]);
		}
	}
	for (const record of records) {
		const repeated = idCounts.get(record.id) !== 1;
		if (repeated) issues.push({ id: record.id, reason: "repeated id" });
		const overlaps = [
			...new Set(
				record.scope.flatMap((verse) =>
					(pairIds.get(pairKey(record, verse)) ?? []).filter(
						(id) => id !== record.id,
					),
				),
			),
		].sort();
		if (overlaps.length > 0) {
			issues.push({
				id: record.id,
				reason: `overlaps ${overlaps.join(", ")} on the same Strong pair and verse`,
			});
		}
		if (repeated || overlaps.length > 0 || !isApproved(record)) continue;
		for (const verse of record.scope) {
			add(indexKey(record.source.strong, verse), record);
			add(indexKey(record.target.strong, verse), record);
		}
	}
	return index;
};

const canonicalTappedStrong = (
	value: string | null | undefined,
): string | null => {
	const parsed = parseSourceStrong(value);
	if (!parsed) return null;
	const greekDigits = parsed.match(/^G(\d+)$/)?.[1];
	return greekDigits ? `G${greekDigits.padStart(4, "0")}` : parsed;
};

const readGloss = async (
	glossSource: RelatedGlossSource,
	strong: string,
	language: Language,
): Promise<string | null> => {
	try {
		const gloss = await glossSource(strong, language);
		return gloss?.trim() ? gloss : null;
	} catch {
		return null;
	}
};

export const createContextualRelationships = (
	input: unknown,
): ContextualRelationships => {
	const { records, issues } = parseCatalog(input);
	const index = buildIndex(records, issues);

	const toEntry = async (
		record: ApprovedRelationship,
		strong: string,
		verse: VerseRef,
		language: Language,
		glossSource: RelatedGlossSource,
	): Promise<ContextualRelatedEntry | null> => {
		const rationale = record.rationale[language];
		if (!rationale) return null;
		const related =
			record.source.strong === strong ? record.target : record.source;
		const gloss = await readGloss(glossSource, related.strong, language);
		if (!gloss) return null;
		return {
			id: record.id,
			related: { ...related, gloss },
			reference: { ...verse },
			rationale,
			credit: record.attribution.credit,
			locator: record.attribution.locator,
			reviewer: record.review.reviewer.name,
		};
	};

	return {
		issues,
		loadRelated: async ({ strong, verse, language }, glossSource) => {
			const canonical = canonicalTappedStrong(strong);
			if (!canonical || !verse) return [];
			const hits = index.get(indexKey(canonical, verse));
			if (!hits) return [];
			const entries = await Promise.all(
				hits.map((record) =>
					toEntry(record, canonical, verse, language, glossSource),
				),
			);
			return entries.filter(
				(entry): entry is ContextualRelatedEntry => entry !== null,
			);
		},
	};
};

export const contextualRelationships = createContextualRelationships(raw);

export const verseRef = (
	book: string,
	chapter: number,
	verse: number,
): VerseRef | null => {
	const bookId = book.toLowerCase();
	return BOOK_IDS.has(bookId) &&
		isPositiveInteger(chapter) &&
		isPositiveInteger(verse)
		? { book_id: bookId, chapter, verse }
		: null;
};

export const formatRelatedReference = (
	reference: VerseRef,
	language: Language,
): string => {
	const book = BOOKS.find(({ id }) => id === reference.book_id);
	const name =
		language === "he"
			? book?.hebrew_name
			: (language === "es" ? book?.spanish_name : book?.name)?.replace(
					/^(.*?)\s*(\d+)$/,
					"$2 $1",
				);
	return `${name} ${reference.chapter}:${reference.verse}`;
};

export const verseRefFromDisplayId = (
	id: string | null | undefined,
): VerseRef | null => {
	const match = id?.match(/^([a-z0-9]+)-(\d+)-(\d+)$/);
	return match ? verseRef(match[1], Number(match[2]), Number(match[3])) : null;
};
