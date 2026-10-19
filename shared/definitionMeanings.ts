/**
 * Phase 1 definition display helpers: strip Unicode BiDi/controls and select
 * a concise primary gloss list while keeping study/detail text as secondary.
 */

const UNICODE_CONTROLS =
	/(?:\u200B|\u200C|\u200D|\u200E|\u200F|[\u202A-\u202E]|[\u2060-\u2064]|[\u2066-\u2069]|\uFEFF)/g;

const DETAIL_SOURCES = new Set(["tcysite-greek-detail"]);

const CUSTOM_SOURCES = new Set(["custom"]);

const TCY_SHORT_SOURCES = new Set([
	"tcysite-greek-strong",
	"tcysite-eric",
]);

const ACADEMIC_SHORT_SOURCES = new Set([
	"stepbible-tbesg",
	"stepbible",
	"tbesg",
	"ubs",
	"ubs-open",
	"strong",
	"bdb",
]);

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

/**
 * Prefer a short primary gloss list. Detail dumps, lexical_detail rows, and
 * fuller lexicon essays move to secondary. Custom wins; Hebrew falls back to
 * the first BDB sense fragment; Greek prefers TCY short then TBESG/UBS short.
 * Never leave primary empty when any usable text remains.
 */
export const partitionDefinitionMeanings = <T extends DefinitionMeaningInput>(
	definitions: T[],
): PartitionedDefinitionMeanings<T> => {
	const cleaned = definitions
		.map((definition) => ({
			...definition,
			text: stripDefinitionControls(definition.text ?? ""),
		}))
		.filter((definition) => Boolean(definition.text.trim())) as T[];

	if (cleaned.length === 0) {
		return { primary: [], secondary: [] };
	}

	const detail: T[] = [];
	const rest: T[] = [];
	for (const definition of cleaned) {
		if (isDetailDefinition(definition)) {
			detail.push(definition);
		} else {
			rest.push(definition);
		}
	}

	let primary: T[] = [];
	let secondary: T[] = [...detail];

	const customs = rest.filter(isCustom);
	const bdb = rest.filter(isBdb);
	const others = rest.filter(
		(definition) => !isCustom(definition) && !isBdb(definition),
	);

	if (customs.length > 0) {
		primary = sortPrimary(customs);
		secondary = [...secondary, ...bdb, ...others];
	} else if (bdb.length > 0) {
		primary = [bdb[0]];
		secondary = [...secondary, ...bdb.slice(1), ...others];
	} else {
		primary = sortPrimary(others);
	}

	primary = dedupeByText(primary);
	secondary = dedupeByText(secondary).filter(
		(item) =>
			!primary.some(
				(primaryItem) =>
					primaryItem.text.trim().toLowerCase() ===
					item.text.trim().toLowerCase(),
			),
	);

	if (primary.length === 0 && secondary.length > 0) {
		const fallback = [...secondary].sort(
			(left, right) => left.text.length - right.text.length,
		)[0];
		primary = [fallback];
		secondary = secondary.filter((item) => item !== fallback);
	}

	return { primary, secondary };
};

export const meaningTexts = (
	definitions: DefinitionMeaningInput[],
): string[] =>
	definitions.map((definition) => definition.text).filter(Boolean);
