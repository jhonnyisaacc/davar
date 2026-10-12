import type { ScriptureSourceLanguage } from "../../../../shared/greekBesorah";
import { instanceSurface } from "../../../../shared/instanceSurface";
import {
	mapLexiconDefinitions,
	type LexiconEntryAsset,
	type LexiconEntryShard,
	type LexiconInstancesAsset,
} from "../../../../shared/lexiconAssets";
import {
	lexiconEntryAssetPath,
	lexiconInstancesAssetPath,
} from "../../../../shared/staticDataPaths";
import { fetchJson } from "./staticDataFetch";

export interface DefinitionItem {
	text: string;
	source: "custom" | "strong" | "bdb" | string;
	language: "en" | "es" | "he" | string;
	review_status?: "approved" | "imported" | "draft";
	license?: string;
}

export interface WordAnalysis {
	strong_number: string;
	hebrew?: string;
	greek?: string;
	source_language?: ScriptureSourceLanguage;
	edition?: string;
	revision?: string;
	lemma?: string;
	translit_en?: string;
	translit_es?: string;
	translit_he?: string;
	lemma_translit_en?: string;
	lemma_translit_es?: string;
	lemma_translit_he?: string;
	short_meaning?: string;
	full_definition?: string;
	definitions: DefinitionItem[];
	root?: string;
	root_strong?: string;
	root_definitions?: DefinitionItem[];
	root_translit_en?: string;
	root_translit_es?: string;
	occurrences_count: number;
	instances?: Array<string | { verse: string; text: string }>;
	instance_policy_version?: string;
	instance_total?: number;
	instance_surface_count?: number;
	instance_tier?: "low" | "medium" | "high";
	instance_omitted_count?: number;
	has_instances_asset?: boolean;
}

type RawDefinition = {
	text?: string;
	text_en?: string;
	text_es?: string;
	text_he?: string;
	source?: string;
	review_status?: "approved" | "imported" | "draft";
	license?: string;
	term_language?: "greek" | "hebrew" | "unknown";
	source_file?: string;
	source_row?: string;
	source_url?: string;
	context?: string;
};

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
	book: string;
	chapter: number;
	verse: number;
	word_positions?: number[] | number;
	stable_id?: string;
	confidence?: number;
	[key: string]: unknown;
};

type RawCustomEntry = {
	strong_number?: string;
	compound_key?: string;
	hebrew?: string;
	transliteration_en?: string;
	transliteration_es?: string;
	term_language?: "greek" | "hebrew" | "unknown";
	canonical_strong?: string | null;
	imported_by?: string;
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

let wordsPromise: Promise<Record<string, RawWordEntry>> | null = null;
let rootsPromise: Promise<Record<string, RawWordEntry>> | null = null;
let customPromise: Promise<Record<string, RawCustomEntry>> | null = null;

const loadWords = async (): Promise<Record<string, RawWordEntry>> => {
	if (!wordsPromise) {
		wordsPromise = fetchJson<Record<string, RawWordEntry>>(
			"/data/dict/words.json",
		);
	}
	return wordsPromise;
};

const loadRoots = async (): Promise<Record<string, RawWordEntry>> => {
	if (!rootsPromise) {
		rootsPromise = fetchJson<Record<string, RawWordEntry>>(
			"/data/dict/roots.json",
		);
	}
	return rootsPromise;
};

const loadCustomDefinitions = async (): Promise<
	Record<string, RawCustomEntry>
> => {
	if (!customPromise) {
		customPromise = fetchJson<Record<string, RawCustomEntry>>(
			"/data/dict/custom_definitions.json",
		);
	}
	return customPromise;
};

const normalizeStrong = (strong?: string): string | null => {
	if (!strong) return null;
	const cleaned = strong.trim().toUpperCase();
	if (/^[HGD]\d+$/.test(cleaned)) return cleaned;
	return null;
};

export const getPolicyInstances = (
	entry: RawCustomEntry,
): RawCustomInstance[] =>
	entry.surface_instances ??
	entry.instances ?? [
		...(entry.oe_instances ?? []),
		...(entry.nt_instances ?? []),
	];

const mapDefinitions = (
	definitions: RawDefinition[] | undefined,
	language: "en" | "es" | "he",
): DefinitionItem[] => {
	if (!definitions?.length) return [];

	const mapped: Array<DefinitionItem | null> = definitions.map((definition) => {
		const text =
			language === "es"
				? definition.text_es
				: language === "he"
					? definition.text_he
					: definition.text_en;

		if (!text) return null;

		return {
			text,
			source: definition.source ?? "strong",
			language,
			review_status: definition.review_status,
			license: definition.license,
		};
	});

	return mapped.filter((item): item is DefinitionItem => Boolean(item));
};

const mergeUniqueDefinitions = (
	...groups: DefinitionItem[][]
): DefinitionItem[] => {
	const seen = new Set<string>();
	const merged: DefinitionItem[] = [];

	for (const group of groups) {
		for (const definition of group) {
			const key = `${definition.source}:${definition.text.toLowerCase()}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(definition);
		}
	}

	return merged;
};

const getRootEntry = (
	rootStrong: string | undefined,
	words: Record<string, RawWordEntry>,
	roots: Record<string, RawWordEntry>,
	custom: Record<string, RawCustomEntry>,
): RawWordEntry | RawCustomEntry | null => {
	const normalizedRoot = normalizeStrong(rootStrong);
	if (!normalizedRoot) return null;

	return (
		roots[normalizedRoot] ??
		words[normalizedRoot] ??
		custom[normalizedRoot] ??
		null
	);
};

const isRawWordEntry = (
	value: RawWordEntry | RawCustomEntry | null,
): value is RawWordEntry =>
	Boolean(value && ("lemma" in value || "root_ref" in value));

const isRawCustomEntry = (
	value: RawWordEntry | RawCustomEntry | null,
): value is RawCustomEntry =>
	Boolean(value && ("root" in value || "compound_key" in value));

const toWordAnalysis = (
	strong: string,
	language: "en" | "es",
	words: Record<string, RawWordEntry>,
	roots: Record<string, RawWordEntry>,
	custom: Record<string, RawCustomEntry>,
): WordAnalysis | null => {
	const wordEntry = words[strong];
	const rootsEntry = roots[strong];
	const customEntry = custom[strong];
	const dictionaryEntry = wordEntry ?? rootsEntry;

	if (!dictionaryEntry && !customEntry) {
		return null;
	}

	const strongNumber =
		customEntry?.strong_number ?? dictionaryEntry?.strong_number ?? strong;
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
		mapDefinitions(customEntry?.definitions, language),
		mapDefinitions(dictionaryEntry?.definitions, language),
	);

	const rootStrong =
		customEntry?.root_strong ??
		dictionaryEntry?.root_ref ??
		dictionaryEntry?.root_strong ??
		(dictionaryEntry ? strongNumber : undefined);
	const rootEntry = getRootEntry(rootStrong, words, roots, custom);

	const rootDefinitions = mergeUniqueDefinitions(
		mapDefinitions(rootEntry?.definitions, language),
	);

	const surface = instanceSurface(customEntry, dictionaryEntry?.occurrences);
	const instances = surface.instances;
	const occurrencesCount = surface.total;

	return {
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
		root_definitions: rootDefinitions.length > 0 ? rootDefinitions : undefined,
		root_translit_en: isRawWordEntry(rootEntry)
			? rootEntry.translit_en
			: rootEntry?.transliteration_en,
		root_translit_es: isRawWordEntry(rootEntry)
			? rootEntry.translit_es
			: rootEntry?.transliteration_es,
		occurrences_count: occurrencesCount,
		instances: instances.length > 0 ? instances : undefined,
		instance_policy_version: customEntry?.instance_policy_version,
		instance_total: customEntry?.instance_total,
		instance_surface_count: customEntry?.instance_surface_count,
		instance_tier: customEntry?.instance_tier,
		instance_omitted_count: customEntry?.instance_omitted_count,
	};
};

const toWordAnalysisFromAsset = (
	entry: LexiconEntryAsset,
	language: "en" | "es",
): WordAnalysis => ({
	strong_number: entry.strong_number,
	hebrew: entry.hebrew,
	translit_en: entry.translit_en,
	translit_es: entry.translit_es,
	definitions: mapLexiconDefinitions(entry.definitions, language),
	root: entry.root,
	root_strong: entry.root_strong,
	root_definitions: entry.root_definitions
		? mapLexiconDefinitions(entry.root_definitions, language)
		: undefined,
	root_translit_en: entry.root_translit_en,
	root_translit_es: entry.root_translit_es,
	occurrences_count: entry.occurrences_count,
	instances: entry.instances,
	has_instances_asset: entry.has_instances_asset,
	instance_policy_version: entry.instance_policy_version,
	instance_total: entry.instance_total,
	instance_surface_count: entry.instance_surface_count,
	instance_tier: entry.instance_tier,
	instance_omitted_count: entry.instance_omitted_count,
});

export const loadLexiconEntryAsset = async (
	strong: string,
): Promise<LexiconEntryAsset | null> => {
	try {
		const shard = await fetchJson<LexiconEntryShard>(
			`/data/${lexiconEntryAssetPath(strong)}`,
		);
		return shard[strong] ?? null;
	} catch {
		return null;
	}
};

export const loadLexiconInstances = async (
	strong?: string,
): Promise<Partial<WordAnalysis> | null> => {
	const normalizedStrong = normalizeStrong(strong);
	if (!normalizedStrong) return null;

	try {
		const payload = await fetchJson<LexiconInstancesAsset>(
			`/data/${lexiconInstancesAssetPath(normalizedStrong)}`,
		);
		return {
			instances: payload.instances,
			occurrences_count: payload.occurrences_count,
			instance_policy_version: payload.instance_policy_version,
			instance_total: payload.instance_total,
			instance_surface_count: payload.instance_surface_count,
			instance_tier: payload.instance_tier,
			instance_omitted_count: payload.instance_omitted_count,
			has_instances_asset: false,
		};
	} catch {
		return null;
	}
};

export const loadLexiconEntry = async (
	strong?: string,
	language?: "en" | "es",
): Promise<WordAnalysis | null> => {
	const normalizedStrong = normalizeStrong(strong);
	if (!normalizedStrong) return null;

	const selectedLanguage = language ?? "en";
	const asset = await loadLexiconEntryAsset(normalizedStrong);
	if (asset) {
		return toWordAnalysisFromAsset(asset, selectedLanguage);
	}

	try {
		const [words, roots, custom] = await Promise.all([
			loadWords(),
			loadRoots(),
			loadCustomDefinitions(),
		]);

		return toWordAnalysis(
			normalizedStrong,
			selectedLanguage,
			words,
			roots,
			custom,
		);
	} catch {
		return null;
	}
};

export const prefetchLexiconEntry = (strong?: string): void => {
	const normalizedStrong = normalizeStrong(strong);
	if (!normalizedStrong) return;
	void loadLexiconEntryAsset(normalizedStrong);
};

export const searchLexicon = async (
	query: string,
	options?: { limit?: number; offset?: number },
): Promise<WordAnalysis[]> => {
	const needle = query.trim().toLowerCase();
	if (!needle) return [];

	const [words, roots, custom] = await Promise.all([
		loadWords(),
		loadRoots(),
		loadCustomDefinitions(),
	]);

	const strongKeys = new Set<string>([
		...Object.keys(words),
		...Object.keys(custom),
	]);

	const matches: WordAnalysis[] = [];

	for (const strong of strongKeys) {
		const word = words[strong];
		const customEntry = custom[strong];

		const haystack = [
			strong,
			word?.lemma,
			word?.translit_en,
			word?.translit_es,
			customEntry?.hebrew,
			customEntry?.transliteration_en,
			customEntry?.transliteration_es,
			...(word?.definitions?.flatMap((definition) => [
				definition.text_en,
				definition.text_es,
			]) ?? []),
			...(customEntry?.definitions?.flatMap((definition) => [
				definition.text_en,
				definition.text_es,
				definition.text,
			]) ?? []),
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();

		if (!haystack.includes(needle)) continue;

		const analysis = toWordAnalysis(strong, "en", words, roots, custom);
		if (analysis) {
			matches.push(analysis);
		}
	}

	const offset = options?.offset ?? 0;
	const limit = options?.limit ?? 20;
	return matches.slice(offset, offset + limit);
};

export const resetLexiconCaches = (): void => {
	wordsPromise = null;
	rootsPromise = null;
	customPromise = null;
};
