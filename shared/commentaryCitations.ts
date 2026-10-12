import type { Citation } from "./productContracts";

export function commentaryCitationLabel(citation: Citation): string {
	const sections = citation.section_labels?.filter(
		(label) => label !== "Introduction" && label !== "Metadata",
	);
	return [citation.title || citation.attribution, sections?.join(" · ")]
		.filter(Boolean)
		.join(" — ");
}
