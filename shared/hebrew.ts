/**
 * Hebrew prefix parsing and display normalization.
 * Web re-exports this module. Mobile still has its own copy.
 */

// Load prefix forms lookup (this would be loaded from the API in a real app)
const PREFIX_FORMS: Record<string, string[]> = {
	// Bet/Beit (ב) prefix with various vowel points and accents
	בְּ: ["Hb"], // with shva and dagesh
	בַּ: ["Hb"], // with patach and dagesh
	בָּ: ["Hb"], // with qamats and dagesh
	בִּ: ["Hb"], // with hiriq and dagesh
	בּ: ["Hb"], // with just dagesh (no vowel)
	בָ: ["Hb"], // with qamats only
	בִ: ["Hb"], // with hiriq only
	בְ: ["Hb"], // with shva only
	ב֖: ["Hb"], // with tiperasim accent
	בָּ֖: ["Hb"], // with qamats, dagesh, and accent

	// Lamed (ל) prefix with various vowel points and accents
	לְ: ["Hl"], // with shva
	לַ: ["Hl"], // with patach
	לָ: ["Hl"], // with qamats
	לִ: ["Hl"], // with hiriq
	ל֑: ["Hl"], // with oleh ve-yored accent
	לַֽ: ["Hl"], // with patach and silluq accent
	לָֽ: ["Hl"], // with qamats and silluq accent

	// Vav/Conjunctive vav (ו) prefix with various vowel points and accents
	וְ: ["Hv", "Hc"], // with shva
	וַ: ["Hv", "Hc"], // with patach
	וָ: ["Hv", "Hc"], // with qamats
	וִ: ["Hv", "Hc"], // with hiriq
	וּ: ["Hv", "Hc"], // with dagesh (no vowel)
	ו: ["Hv", "Hc"], // without vowels or accents
	וַֽ: ["Hv", "Hc"], // with patach and silluq accent

	// Kaf (כ) prefix with various vowel points
	כְּ: ["Hk"], // with shva and dagesh
	כַּ: ["Hk"], // with patach and dagesh
	כָּ: ["Hk"], // with qamats and dagesh
	כִּ: ["Hk"], // with hiriq and dagesh
	כּ: ["Hk"], // with just dagesh (no vowel)

	// Mem (מ) prefix with various vowel points
	מִ: ["Hm"], // with hiriq
	מַ: ["Hm"], // with patach
	מֵ: ["Hm"], // with tsere

	// Heh (ה) prefix with various vowel points and accents
	הַ: ["Hd"], // with patach
	הָ: ["Hd"], // with qamats
	הִ: ["Hd"], // with hiriq
	הָֽ: ["Hd"], // with qamats and silluq accent
	// Add more forms as needed
};

const HEBREW_MARKS_REGEX = /[\u0591-\u05C7]/g;
const HEBREW_MARKS_SINGLE = /[\u0591-\u05C7]/;
const HEBREW_BIDI_CONTROLS =
	/(?:\u200C|\u200D|\u200E|\u200F|[\u202A-\u202E]|[\u2066-\u2069])/g;

const stripHebrewMarks = (text: string) => text.replace(HEBREW_MARKS_REGEX, "");

const buildPrefixFormsById = () => {
	const map: Record<string, string[]> = {};
	Object.entries(PREFIX_FORMS).forEach(([form, ids]) => {
		ids.forEach((id) => {
			map[id] = map[id] ? [...map[id], form] : [form];
		});
	});
	return map;
};

const PREFIX_FORMS_BY_ID = buildPrefixFormsById();

const sliceByStrippedLength = (
	text: string,
	startIndex: number,
	strippedLength: number,
) => {
	let count = 0;
	let endIndex = startIndex;
	for (; endIndex < text.length; endIndex += 1) {
		const char = text[endIndex];
		if (char === "/") {
			continue;
		}
		if (!HEBREW_MARKS_SINGLE.test(char)) {
			count += 1;
			if (count >= strippedLength) {
				endIndex += 1;
				// Continue to include all combining marks after this character
				while (endIndex < text.length) {
					const nextChar = text[endIndex];
					if (nextChar === "/" || !HEBREW_MARKS_SINGLE.test(nextChar)) {
						break;
					}
					endIndex += 1;
				}
				break;
			}
		}
	}
	return text.slice(startIndex, endIndex);
};

export const getPrefixSegments = (
	word: string,
	prefixIds: string[],
): { prefixes: string[]; root: string } => {
	if (!word || !prefixIds.length) {
		return { prefixes: [], root: word };
	}

	// Remove "/" separators for uniform processing
	// The "/" is a data format indicator but should not affect prefix extraction
	const cleanWord = word.replace(/\//g, "");

	const strippedWord = stripHebrewMarks(cleanWord);
	const prefixes: string[] = [];
	let rawIndex = 0;
	let strippedIndex = 0;

	// Always validate against prefixIds - extract prefixes strictly
	for (const prefixId of prefixIds) {
		const forms = PREFIX_FORMS_BY_ID[prefixId] ?? [];
		const sortedForms = forms
			.map((form) => ({ form, stripped: stripHebrewMarks(form) }))
			.sort((a, b) => b.stripped.length - a.stripped.length);

		const match = sortedForms.find((form) =>
			strippedWord.startsWith(form.stripped, strippedIndex),
		);

		if (!match) {
			break;
		}

		const segment = sliceByStrippedLength(
			cleanWord,
			rawIndex,
			match.stripped.length,
		);
		prefixes.push(segment);
		rawIndex += segment.length;
		strippedIndex += match.stripped.length;
	}

	if (!prefixes.length) {
		return { prefixes: [], root: word.replace(/\//g, "") };
	}

	return {
		prefixes,
		root: cleanWord.slice(rawIndex),
	};
};

export interface ParsedWord {
	full: string;
	prefix?: {
		text: string;
		particle: string;
		meanings: Record<string, string[]>;
	};
	root: string;
}

/**
 * Parse a Hebrew word into prefix and root components
 */
export function parseHebrewWord(word: string): ParsedWord {
	// Check if word contains "/" separator (data format with explicit prefix separation)
	if (word.includes("/")) {
		const parts = word.split("/");
		if (parts.length >= 2) {
			const prefixText = parts.slice(0, -1).join("");
			const rootText = parts.slice(-1).join("");

			const cleanedPrefixText = stripHebrewMarks(prefixText.replace(/\//g, ""));

			// Find the prefix particle from our lookup
			const prefixForms = Object.keys(PREFIX_FORMS).sort(
				(a, b) => b.length - a.length,
			);
			for (const prefixForm of prefixForms) {
				if (cleanedPrefixText.includes(stripHebrewMarks(prefixForm))) {
					return {
						full: word,
						prefix: {
							text: prefixText.replace(/\//g, ""),
							particle: PREFIX_FORMS[prefixForm][0],
							meanings: {}, // Would be loaded from API
						},
						root: rootText.replace(/\//g, ""),
					};
				}
			}

			// If no specific prefix form found, still treat first part as prefix
			return {
				full: word,
				prefix: {
					text: prefixText.replace(/\//g, ""),
					particle: "unknown",
					meanings: {},
				},
				root: rootText.replace(/\//g, ""),
			};
		}
	}

	const withoutMarks = stripHebrewMarks(word);

	// Try to find prefix (longest match first)
	const prefixForms = Object.keys(PREFIX_FORMS).sort(
		(a, b) => b.length - a.length,
	);

	for (const prefixForm of prefixForms) {
		const strippedPrefixForm = stripHebrewMarks(prefixForm);
		if (withoutMarks.startsWith(strippedPrefixForm)) {
			const prefixText = sliceByStrippedLength(
				word,
				0,
				strippedPrefixForm.length,
			);
			const root = word.slice(prefixText.length);
			if (root.length > 0) {
				// Ensure there's a root left
				return {
					full: word,
					prefix: {
						text: prefixText,
						particle: PREFIX_FORMS[prefixForm][0],
						meanings: {}, // Would be loaded from API
					},
					root: root,
				};
			}
		}
	}

	// No prefix found
	return {
		full: word,
		root: word,
	};
}

/**
 * Strip nikud from Hebrew text
 */
export function stripNikud(text: string): string {
	return text.replace(/[\u05B0-\u05C7]/g, "");
}

/**
 * Strip cantillation marks from Hebrew text
 */
export function stripCantillation(text: string): string {
	return text.replace(/[\u0591-\u05AF]/g, "");
}

/**
 * Strip meteg (U+05BD) from Hebrew text
 */
export function stripMeteg(text: string): string {
	return text.replace(/\u05BD/g, "");
}

/**
 * Remove maqaf from Hebrew display text and normalize whitespace.
 * Converts maqaf (־) into a plain separator space for frontend readability.
 */
export function removeMaqafForDisplay(text: string): string {
	return text
		.replace(/\u05BE/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Remove sof pasuk (׃) from Hebrew display text.
 */
export function removeSofPasukForDisplay(text: string): string {
	return text.replace(/\u05C3/g, "");
}

/**
 * Normalize Hebrew display text and remove bidi control characters
 */
export function normalizeHebrewDisplay(text: string): string {
	return text.normalize("NFC").replace(HEBREW_BIDI_CONTROLS, "");
}

/**
 * Normalize Hebrew text (strip both nikud and cantillation)
 */
export function normalizeHebrew(text: string): string {
	return stripCantillation(stripNikud(text));
}

export function splitLeadingHebrewCluster(text: string): {
	head: string;
	tail: string;
} {
	if (!text) {
		return { head: "", tail: "" };
	}

	// Head is just the first consonant (no marks)
	// Tail is all the rest (marks + any other characters)
	const head = text[0];
	const tail = text.slice(1);

	return { head, tail };
}
