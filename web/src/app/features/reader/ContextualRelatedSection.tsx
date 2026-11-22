import {
	type ContextualRelationships,
	contextualRelationships,
	formatRelatedReference,
	loadedEntries,
	type RelatedGlossSource,
	type RelatedLoad,
	relatedRequest,
	type VerseRef,
	watchRelated,
} from "@davar/shared/contextualRelationships";
import { formatDefinitionMeaningForDisplay } from "@davar/shared/definitionMeanings";
import { type CSSProperties, useEffect, useState } from "react";
import { type AppLanguage, useTranslation } from "../../hooks/useTranslation";
import { loadRelatedGloss } from "../../services/staticDataLexicon";

const LABEL_STYLE: CSSProperties = {
	fontFamily: "'Inter', sans-serif",
	fontSize: "11px",
	color: "var(--text-secondary)",
	fontWeight: 700,
	letterSpacing: "0.15em",
	textTransform: "uppercase",
};

const NOTE_STYLE: CSSProperties = {
	fontFamily: "'Inter', sans-serif",
	fontSize: "12px",
	lineHeight: 1.5,
	color: "var(--text-secondary)",
};

export function ContextualRelatedSection({
	strong,
	verse,
	language,
	catalog = contextualRelationships,
	glossSource = loadRelatedGloss,
}: {
	strong: string | null | undefined;
	verse: VerseRef | null;
	language: AppLanguage;
	catalog?: ContextualRelationships;
	glossSource?: RelatedGlossSource;
}) {
	const { t } = useTranslation(language);
	const [loaded, setLoaded] = useState<RelatedLoad | null>(null);
	const {
		bookId,
		chapter,
		verse: verseNumber,
		key,
	} = relatedRequest(strong, verse, language);

	useEffect(
		() =>
			watchRelated(
				catalog,
				{ strong, bookId, chapter, verse: verseNumber, language },
				glossSource,
				setLoaded,
			),
		[bookId, catalog, chapter, glossSource, language, strong, verseNumber],
	);

	const entries = loadedEntries(loaded, key);
	if (entries.length === 0) return null;

	return (
		<div className="pb-6 space-y-6">
			{entries.map((entry) => {
				const isHebrew = entry.related.language === "hebrew";
				const reference = formatRelatedReference(entry.reference, language);
				return (
					<section key={entry.id} className="space-y-3">
						<h3 style={LABEL_STYLE}>{t("wordCard.contextualRelation")}</h3>
						<div style={NOTE_STYLE}>
							{t("wordCard.contextualRelationScope", { reference })}
						</div>
						<div style={LABEL_STYLE}>
							{t(
								isHebrew
									? "wordCard.contextualRelationHebrew"
									: "wordCard.contextualRelationGreek",
							)}
						</div>
						<div
							dir={isHebrew ? "rtl" : "ltr"}
							lang={isHebrew ? "he" : "el"}
							style={{
								fontFamily: "'Cardo', serif",
								fontSize: "32px",
								lineHeight: 1.4,
								color: "var(--text-hebrew)",
							}}
						>
							{entry.related.lemma}
						</div>
						<div style={{ ...LABEL_STYLE, fontWeight: 500 }}>
							{entry.related.strong} · {entry.related.transliteration}
						</div>
						<div className="flex flex-wrap justify-center gap-2">
							<span
								style={{
									fontFamily: "'Jost', sans-serif",
									fontSize: "15px",
									lineHeight: 1.4,
									fontWeight: 500,
									padding: "5px 12px",
									borderRadius: "4px",
									background: "var(--accent-light)",
									color: "var(--accent-darker)",
									whiteSpace: "normal",
								}}
							>
								{formatDefinitionMeaningForDisplay(entry.related.gloss)}
							</span>
						</div>
						<div style={NOTE_STYLE}>{t("wordCard.contextualRelationNote")}</div>
						<div style={LABEL_STYLE}>{t("wordCard.contextualRelationWhy")}</div>
						<p
							style={{
								fontFamily: "'Jost', sans-serif",
								fontSize: "15px",
								lineHeight: 1.5,
								textAlign: "start",
								color: "var(--text-primary)",
							}}
						>
							{entry.rationale}
						</p>
						<div style={{ ...NOTE_STYLE, textAlign: "start" }}>
							<div>{entry.credit}</div>
							<div>{entry.locator}</div>
							<div>
								{t("wordCard.contextualRelationReviewedBy", {
									reviewer: entry.reviewer,
								})}
							</div>
						</div>
					</section>
				);
			})}
		</div>
	);
}
