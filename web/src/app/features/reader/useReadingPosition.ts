import { useEffect, useState } from "react";
import {
	getStoredReadingState,
	type ReadingStateV2,
	saveReadingState,
	updateLastPositionForBook,
} from "../../utils/storageHelpers";

export function useReadingPosition(initialState: ReadingStateV2) {
	const [currentBook, setCurrentBook] = useState(initialState.book);
	const [currentChapter, setCurrentChapter] = useState(initialState.chapter);
	const [currentVerse, setCurrentVerse] = useState(initialState.verse);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const stored = getStoredReadingState();
		if (stored) {
			let updated = {
				...stored,
				book: currentBook,
				chapter: currentChapter,
				verse: currentVerse,
			};
			updated = updateLastPositionForBook(
				updated,
				currentBook,
				currentChapter,
				currentVerse,
			);
			saveReadingState(updated);
		}
	}, [currentBook, currentChapter, currentVerse]);

	return {
		currentBook,
		setCurrentBook,
		currentChapter,
		setCurrentChapter,
		currentVerse,
		setCurrentVerse,
	};
}
