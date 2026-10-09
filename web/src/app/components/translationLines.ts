/** Line widths for the translation hold. Same rule as earlyTranslationLines in index.html. */
export function translationLineWidths(
	wordCount: number,
	columnWidth: number,
): number[] {
	if (!(wordCount > 0) || !(columnWidth > 0)) return [];
	const textWidth = wordCount * 64;
	let count = Math.ceil(textWidth / columnWidth);
	if (count > 8) count = 8;
	const lines: number[] = [];
	for (let index = 0; index < count; index += 1) {
		if (index === count - 1) {
			const last = textWidth - (count - 1) * columnWidth;
			lines.push(Math.max(48, Math.min(columnWidth, last)));
		} else {
			lines.push(columnWidth);
		}
	}
	return lines;
}

/** Same column estimate as earlyTranslationColumn in index.html. */
export function translationColumnWidth(viewportWidth: number): number {
	const cap = viewportWidth >= 768 ? 896 : 768;
	const panel = Math.min(Math.max(viewportWidth - 48, 0), cap);
	return Math.max(0, panel - 32);
}

export function translationWordCount(
	words: readonly { text?: string }[] | null | undefined,
	fallbackText: string,
): number {
	if (words && words.length > 0) return words.length;
	return fallbackText.split(/\s+/).filter(Boolean).length;
}
