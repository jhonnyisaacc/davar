/**
 * Definition display helpers: strip Unicode BiDi/controls and structure
 * meanings into gloss / senses / fuller / study for web and mobile.
 */

const UNICODE_CONTROLS =
	/(?:\u200B|\u200C|\u200D|\u200E|\u200F|[\u202A-\u202E]|[\u2060-\u2064]|[\u2066-\u2069]|\uFEFF)/g;

const DETAIL_SOURCES = new Set(["tcysite-greek-detail"]);

const CUSTOM_SOURCES = new Set(["custom"]);

const TCY_SHORT_SOURCES = new Set(["tcysite-greek-strong", "tcysite-eric"]);

const ACADEMIC_SHORT_SOURCES = new Set([
	"stepbible-tbesg",
	"stepbible",
	"tbesg",
	"ubs",
	"ubs-open",
	"strong",
	"bdb",
]);

/** Schema id for structured lexicon meanings consumed by clients. */
export const LEXICON_MEANINGS_SCHEMA = 2 as const;

export type DefinitionMeaningRole = "short" | "fuller" | "gloss";

export type DefinitionMeaningInput = {
	text: string;
	source?: string;
	definition_kind?: string | null;
	sense?: string | null;
	role?: DefinitionMeaningRole;
};

export type PartitionedDefinitionMeanings<T extends DefinitionMeaningInput> = {
	primary: T[];
	secondary: T[];
};

export type StructuredDefinitionMeanings<T extends DefinitionMeaningInput> = {
	/** Short reading glosses (custom / preferred short). */
	gloss: T[];
	/** BDB (and similar) sense fragments kept out of the primary gloss. */
	senses: T[];
	/** TBESG/UBS fuller lexicon essays. */
	fuller: T[];
	/** Study / detail commentary (TCY detail, extra study rows). */
	study: T[];
	/** Backward-compatible primary = gloss. */
	primary: T[];
	/** Backward-compatible secondary = senses + fuller + study. */
	secondary: T[];
};

/** Strip BiDi isolates, embedding marks, zero-width/BOM, and friends from definition text. */
export const stripDefinitionControls = (text: string): string =>
	text.replace(UNICODE_CONTROLS, "").replace(/[ \t]+\n/g, "\n").trim();

const normalizeSource = (source?: string): string =>
	(source ?? "").trim().toLowerCase();

export const isDetailDefinition = (
	definition: DefinitionMeaningInput,
): boolean => {
	const source = normalizeSource(definition.source);
	const kind = (definition.definition_kind ?? "").trim().toLowerCase();
	if (DETAIL_SOURCES.has(source) || kind === "lexical_detail") {
		return true;
	}
	if (definition.role === "fuller") {
		return true;
	}
	return false;
};

export const isFullerDefinition = (
	definition: DefinitionMeaningInput,
): boolean => definition.role === "fuller";

const sourceRank = (source?: string): number => {
	const normalized = normalizeSource(source);
	if (CUSTOM_SOURCES.has(normalized)) return 0;
	if (TCY_SHORT_SOURCES.has(normalized)) return 1;
	if (normalized.startsWith("tcysite-") && !DETAIL_SOURCES.has(normalized)) {
		return 2;
	}
	if (ACADEMIC_SHORT_SOURCES.has(normalized)) return 3;
	if (!normalized) return 4;
	return 2;
};

const sortPrimary = <T extends DefinitionMeaningInput>(items: T[]): T[] =>
	[...items].sort((left, right) => {
		const rankDelta = sourceRank(left.source) - sourceRank(right.source);
		if (rankDelta !== 0) return rankDelta;
		return 0;
	});

const dedupeByText = <T extends DefinitionMeaningInput>(items: T[]): T[] => {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const key = item.text.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
};

const isCustom = (definition: DefinitionMeaningInput): boolean =>
	CUSTOM_SOURCES.has(normalizeSource(definition.source));

const isBdb = (definition: DefinitionMeaningInput): boolean =>
	normalizeSource(definition.source) === "bdb";

const sameText = (left: DefinitionMeaningInput, right: DefinitionMeaningInput) =>
	left.text.trim().toLowerCase() === right.text.trim().toLowerCase();

const notIn = <T extends DefinitionMeaningInput>(haystack: T[], item: T) =>
	!haystack.some((entry) => sameText(entry, item));

/**
 * Structure definitions into gloss / senses / fuller / study.
 * Custom wins for gloss; otherwise first BDB fragment; Greek prefers TCY then
 * TBESG/UBS short. Never leave gloss empty when any usable text remains.
 */
export const structureDefinitionMeanings = <T extends DefinitionMeaningInput>(
	definitions: T[],
): StructuredDefinitionMeanings<T> => {
	const cleaned = definitions
		.map((definition) => ({
			...definition,
			text: stripDefinitionControls(definition.text ?? ""),
		}))
		.filter((definition) => Boolean(definition.text.trim())) as T[];

	const empty: StructuredDefinitionMeanings<T> = {
		gloss: [],
		senses: [],
		fuller: [],
		study: [],
		primary: [],
		secondary: [],
	};

	if (cleaned.length === 0) {
		return empty;
	}

	const fuller: T[] = [];
	const study: T[] = [];
	const rest: T[] = [];
	for (const definition of cleaned) {
		if (isFullerDefinition(definition)) {
			fuller.push(definition);
		} else if (isDetailDefinition(definition)) {
			study.push(definition);
		} else {
			rest.push(definition);
		}
	}

	let gloss: T[] = [];
	let senses: T[] = [];

	const customs = rest.filter(isCustom);
	const bdb = rest.filter(isBdb);
	const others = rest.filter(
		(definition) => !isCustom(definition) && !isBdb(definition),
	);

	if (customs.length > 0) {
		gloss = sortPrimary(customs);
		senses = bdb;
		study.push(...others);
	} else if (bdb.length > 0) {
		gloss = [bdb[0]];
		senses = bdb.slice(1);
		study.push(...others);
	} else {
		gloss = sortPrimary(others);
	}

	gloss = dedupeByText(gloss);
	senses = dedupeByText(senses).filter((item) => notIn(gloss, item));
	const fullerDeduped = dedupeByText(fuller).filter(
		(item) => notIn(gloss, item) && notIn(senses, item),
	);
	const studyDeduped = dedupeByText(study).filter(
		(item) =>
			notIn(gloss, item) &&
			notIn(senses, item) &&
			notIn(fullerDeduped, item),
	);

	if (
		gloss.length === 0 &&
		(senses.length > 0 ||
			fullerDeduped.length > 0 ||
			studyDeduped.length > 0)
	) {
		const pool = [...senses, ...fullerDeduped, ...studyDeduped];
		const fallback = [...pool].sort(
			(left, right) => left.text.length - right.text.length,
		)[0];
		gloss = [fallback];
		senses = senses.filter((item) => !sameText(item, fallback));
		const fullerOut = fullerDeduped.filter((item) => !sameText(item, fallback));
		const studyOut = studyDeduped.filter((item) => !sameText(item, fallback));
		const secondary = [...senses, ...fullerOut, ...studyOut];
		return {
			gloss,
			senses,
			fuller: fullerOut,
			study: studyOut,
			primary: gloss,
			secondary,
		};
	}

	const secondary = [...senses, ...fullerDeduped, ...studyDeduped];
	return {
		gloss,
		senses,
		fuller: fullerDeduped,
		study: studyDeduped,
		primary: gloss,
		secondary,
	};
};

/**
 * Prefer a short primary gloss list. Detail dumps, lexical_detail rows, and
 * fuller lexicon essays move to secondary.
 */
export const partitionDefinitionMeanings = <T extends DefinitionMeaningInput>(
	definitions: T[],
): PartitionedDefinitionMeanings<T> => {
	const structured = structureDefinitionMeanings(definitions);
	return {
		primary: structured.primary,
		secondary: structured.secondary,
	};
};

export const meaningTexts = (
	definitions: DefinitionMeaningInput[],
): string[] =>
	definitions.map((definition) => definition.text).filter(Boolean);
