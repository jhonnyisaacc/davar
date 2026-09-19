import { instanceSurface } from "./instanceSurface";
import {
	lexiconEntryShardKey,
	normalizeStrongNumber,
} from "./staticDataPaths";

export const LEXICON_INSTANCE_SPLIT_THRESHOLD_BYTES = 4096;

export type LexiconDefinitionAsset = {
	text?: string;
	text_en?: string;
	text_es?: string;
	text_he?: string;
	source?: string;
	review_status?: "approved" | "imported" | "draft";
	license?: string;
};

export type LexiconEntryAsset = {
	strong_number: string;
	hebrew?: string;
	translit_en?: string;
	translit_es?: string;
	definitions: LexiconDefinitionAsset[];
	root?: string;
	root_strong?: string;
	root_definitions?: LexiconDefinitionAsset[];
	root_translit_en?: string;
	root_translit_es?: string;
	occurrences_count: number;
	instances?: Array<string | { verse: string; text: string }>;
	has_instances_asset?: boolean;
	instance_policy_version?: string;
	instance_total?: number;
	instance_surface_count?: number;
	instance_tier?: "low" | "medium" | "high";
	instance_omitted_count?: number;
};

export type LexiconInstancesAsset = {
	strong_number: string;
	instances: Array<string | { verse: string; text: string }>;
	occurrences_count: number;
	instance_policy_version?: string;
	instance_total?: number;
	instance_surface_count?: number;
	instance_tier?: "low" | "medium" | "high";
	instance_omitted_count?: number;
};

export type LexiconEntryShard = Record<string, LexiconEntryAsset>;

type RawDefinition = LexiconDefinitionAsset;

type RawOccurrence = {
	total?: number;
	references?: string[];
	surface_references?: string[];
};

type RawWordEntry = {
	strong_number?: string;
	lemma?: string;
	hebrew?: string;
	translit_en?: string;
	translit_es?: string;
	transliteration_en?: string;
	transliteration_es?: string;
	definitions?: RawDefinition[];
	occurrences?: RawOccurrence;
	root_ref?: string;
	root_strong?: string;
};

type RawCustomInstance = {
	book?: string;
	chapter?: number;
	verse?: number;
	text?: string;
};

type RawCustomEntry = {
	strong_number?: string;
	hebrew?: string;
	transliteration_en?: string;
	transliteration_es?: string;
	definitions?: RawDefinition[];
	root?: string;
	root_strong?: string;
	manual_instances?: string[];
	oe_instances?: RawCustomInstance[];
	nt_instances?: RawCustomInstance[];
	instances?: RawCustomInstance[];
	surface_instances?: RawCustomInstance[];
	instance_policy_version?: string;
	instance_total?: number;
	instance_surface_count?: number;
	instance_tier?: "low" | "medium" | "high";
	instance_omitted_count?: number;
};

type DefinitionItem = {
	text: string;
	source: string;
	language: string;
	review_status?: "approved" | "imported" | "draft";
	license?: string;
};

const mergeUniqueDefinitions = (
	...groups: RawDefinition[][]
): RawDefinition[] => {
	const seen = new Set<string>();
	const merged: RawDefinition[] = [];

	for (const group of groups) {
		for (const definition of group) {
			const key = [
				definition.source ?? "",
				definition.text_en ?? "",
				definition.text_es ?? "",
				definition.text_he ?? "",
				definition.text ?? "",
			]
				.join(":")
				.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(definition);
		}
	}

	return merged;
};

const isRawWordEntry = (
	value: RawWordEntry | RawCustomEntry | null,
): value is RawWordEntry =>
	Boolean(value && ("lemma" in value || "root_ref" in value));

const isRawCustomEntry = (
	value: RawWordEntry | RawCustomEntry | null,
): value is RawCustomEntry =>
	Boolean(value && ("root" in value || "transliteration_en" in value));

const getRootEntry = (
	rootStrong: string | undefined,
	words: Record<string, RawWordEntry>,
	roots: Record<string, RawWordEntry>,
	custom: Record<string, RawCustomEntry>,
): RawWordEntry | RawCustomEntry | null => {
	const normalizedRoot = normalizeStrongNumber(rootStrong);
	if (!normalizedRoot) return null;

	return (
		roots[normalizedRoot] ??
		words[normalizedRoot] ??
		custom[normalizedRoot] ??
		null
	);
};

export const mapLexiconDefinitions = (
	definitions: RawDefinition[] | undefined,
	language: "en" | "es" | "he",
): DefinitionItem[] => {
	if (!definitions?.length) return [];

	const mapped: DefinitionItem[] = [];
	for (const definition of definitions) {
		const text =
			language === "es"
				? definition.text_es
				: language === "he"
					? definition.text_he
					: (definition.text_en ?? definition.text);

		if (!text) continue;

		mapped.push({
			text,
			source: definition.source ?? "strong",
			language,
			review_status: definition.review_status,
			license: definition.license,
		});
	}
	return mapped;
};

export const buildLexiconEntryAsset = (
	strong: string,
	words: Record<string, RawWordEntry>,
	roots: Record<string, RawWordEntry>,
	custom: Record<string, RawCustomEntry>,
): {
	entry: LexiconEntryAsset;
	instances: LexiconInstancesAsset | null;
} | null => {
	const normalized = normalizeStrongNumber(strong);
	if (!normalized) return null;

	const wordEntry = words[normalized];
	const rootsEntry = roots[normalized];
	const customEntry = custom[normalized];
	const dictionaryEntry = wordEntry ?? rootsEntry;

	if (!dictionaryEntry && !customEntry) {
		return null;
	}

	const strongNumber =
		customEntry?.strong_number ?? dictionaryEntry?.strong_number ?? normalized;
	const hebrew =
		customEntry?.hebrew ?? dictionaryEntry?.lemma ?? dictionaryEntry?.hebrew;
	const translit_en =
		customEntry?.transliteration_en ??
		dictionaryEntry?.translit_en ??
		dictionaryEntry?.transliteration_en;
	const translit_es =
		customEntry?.transliteration_es ??
		dictionaryEntry?.translit_es ??
		dictionaryEntry?.transliteration_es;

	const definitions = mergeUniqueDefinitions(
		customEntry?.definitions ?? [],
		dictionaryEntry?.definitions ?? [],
	);

	const rootStrong =
		customEntry?.root_strong ??
		dictionaryEntry?.root_ref ??
		dictionaryEntry?.root_strong ??
		(dictionaryEntry ? strongNumber : undefined);
	const rootEntry = getRootEntry(rootStrong, words, roots, custom);
	const rootDefinitions = mergeUniqueDefinitions(rootEntry?.definitions ?? []);
	const surface = instanceSurface(customEntry, dictionaryEntry?.occurrences);
	const instancePayload = {
		instances: surface.instances,
		occurrences: dictionaryEntry?.occurrences ?? null,
		surface_instances: customEntry?.surface_instances ?? null,
		custom_instances: customEntry?.instances ?? null,
	};
	const instanceBytes = new TextEncoder().encode(
		JSON.stringify(instancePayload),
	).length;
	const shouldSplitInstances =
		instanceBytes > LEXICON_INSTANCE_SPLIT_THRESHOLD_BYTES;

	const entry: LexiconEntryAsset = {
		strong_number: strongNumber,
		hebrew,
		translit_en,
		translit_es,
		definitions,
		root:
			customEntry?.root ??
			(isRawWordEntry(rootEntry) ? rootEntry.lemma : undefined) ??
			(isRawCustomEntry(rootEntry) ? rootEntry.hebrew : undefined),
		root_strong: rootStrong,
		root_definitions:
			rootDefinitions.length > 0 ? rootDefinitions : undefined,
		root_translit_en: isRawWordEntry(rootEntry)
			? rootEntry.translit_en
			: rootEntry?.transliteration_en,
		root_translit_es: isRawWordEntry(rootEntry)
			? rootEntry.translit_es
			: rootEntry?.transliteration_es,
		occurrences_count: surface.total,
		instances: shouldSplitInstances
			? undefined
			: surface.instances.length > 0
				? surface.instances
				: undefined,
		has_instances_asset: shouldSplitInstances || undefined,
		instance_policy_version: customEntry?.instance_policy_version,
		instance_total: customEntry?.instance_total,
		instance_surface_count: customEntry?.instance_surface_count,
		instance_tier: customEntry?.instance_tier,
		instance_omitted_count: customEntry?.instance_omitted_count,
	};

	const instances = shouldSplitInstances
		? {
				strong_number: strongNumber,
				instances: surface.instances,
				occurrences_count: surface.total,
				instance_policy_version: customEntry?.instance_policy_version,
				instance_total: customEntry?.instance_total,
				instance_surface_count: customEntry?.instance_surface_count,
				instance_tier: customEntry?.instance_tier,
				instance_omitted_count: customEntry?.instance_omitted_count,
			}
		: null;

	return { entry, instances };
};

const indexByNormalizedStrong = <T extends { strong_number?: string }>(
	dictionary: Record<string, T>,
): { indexed: Record<string, T>; skippedKeys: string[] } => {
	const indexed: Record<string, T> = {};
	const skippedKeys: string[] = [];
	for (const [key, value] of Object.entries(dictionary)) {
		const normalized =
			normalizeStrongNumber(key) ??
			normalizeStrongNumber(value.strong_number);
		if (!normalized) {
			skippedKeys.push(key);
			continue;
		}
		indexed[normalized] = value;
	}
	return { indexed, skippedKeys };
};

export const buildLexiconAssets = (
	words: Record<string, RawWordEntry>,
	roots: Record<string, RawWordEntry>,
	custom: Record<string, RawCustomEntry>,
): {
	shards: Record<string, LexiconEntryShard>;
	instances: Record<string, LexiconInstancesAsset>;
	skippedKeys: string[];
	duplicateKeys: string[];
	missingStrong: string[];
} => {
	const shards: Record<string, LexiconEntryShard> = {};
	const instances: Record<string, LexiconInstancesAsset> = {};
	const duplicateKeys: string[] = [];
	const missingStrong: string[] = [];
	const seen = new Set<string>();

	const wordsIndex = indexByNormalizedStrong(words);
	const rootsIndex = indexByNormalizedStrong(roots);
	const customIndex = indexByNormalizedStrong(custom);
	const wordsByStrong = wordsIndex.indexed;
	const rootsByStrong = rootsIndex.indexed;
	const customByStrong = customIndex.indexed;
	const skippedKeys = [
		...wordsIndex.skippedKeys,
		...rootsIndex.skippedKeys,
		...customIndex.skippedKeys,
	];

	const allKeys = new Set<string>([
		...Object.keys(wordsByStrong),
		...Object.keys(rootsByStrong),
		...Object.keys(customByStrong),
	]);

	for (const key of allKeys) {
		const normalized = normalizeStrongNumber(key);
		if (!normalized) {
			skippedKeys.push(key);
			continue;
		}

		if (seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);

		const built = buildLexiconEntryAsset(
			normalized,
			wordsByStrong,
			rootsByStrong,
			customByStrong,
		);
		if (!built) {
			missingStrong.push(normalized);
			continue;
		}

		const shardKey = lexiconEntryShardKey(normalized);
		if (!shards[shardKey]) {
			shards[shardKey] = {};
		}
		if (shards[shardKey][normalized]) {
			duplicateKeys.push(normalized);
			continue;
		}
		shards[shardKey][normalized] = built.entry;
		if (built.instances) {
			instances[normalized] = built.instances;
		}
	}

	return { shards, instances, skippedKeys, duplicateKeys, missingStrong };
};

export const isCurrentLexiconResult = (
	requestedStrong: string | null | undefined,
	resultStrong: string | null | undefined,
): boolean => {
	const requested = normalizeStrongNumber(requestedStrong);
	const result = normalizeStrongNumber(resultStrong);
	return Boolean(requested && result && requested === result);
};
