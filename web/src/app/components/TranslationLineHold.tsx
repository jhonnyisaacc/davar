import { useEffect, useState } from "react";
import {
	translationColumnWidth,
	translationLineWidths,
} from "./translationLines";

export function TranslationLineHold({ wordCount }: { wordCount: number }) {
	const columnWidth = useTranslationColumnWidth();
	const lines = translationLineWidths(wordCount, columnWidth);
	if (lines.length === 0) return null;
	const keyedLines = lines.reduce<{ key: string; width: number }[]>(
		(rows, width) => {
			rows.push({ key: `${rows.length + 1}-${width}`, width });
			return rows;
		},
		[],
	);
	return (
		<div className="translation-line-hold" data-translation-hold="">
			{keyedLines.map((line) => (
				<span
					className="translation-line"
					key={line.key}
					style={{ width: line.width }}
				/>
			))}
		</div>
	);
}

function useTranslationColumnWidth(): number {
	const [width, setWidth] = useState(() =>
		typeof window === "undefined"
			? 0
			: translationColumnWidth(window.innerWidth),
	);
	useEffect(() => {
		const update = () => setWidth(translationColumnWidth(window.innerWidth));
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);
	return width;
}
