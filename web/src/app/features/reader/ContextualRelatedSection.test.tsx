import { afterEach, expect, test } from "bun:test";
import { createContextualRelationships } from "@davar/shared/contextualRelationships";
import { installTestDom } from "../../testDom";
import { ContextualRelatedSection } from "./ContextualRelatedSection";

installTestDom("http://localhost:5300/john/1/1");
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
afterEach(cleanup);

const JOHN_1_1 = { book_id: "john", chapter: 1, verse: 1 };

const fixture = (id: string, greek: string, hebrew: string) => ({
	id,
	predicate: "contextually_related_to",
	source: {
		language: "greek",
		strong: greek,
		lemma: `fixture-lemma-${greek}`,
		transliteration: `fixture-translit-${greek}`,
	},
	target: {
		language: "hebrew",
		strong: hebrew,
		lemma: `fixture-lemma-${hebrew}`,
		transliteration: `fixture-translit-${hebrew}`,
	},
	scope: [
		{
			system_id: "davar-v1",
			kind: "verse",
			book_id: "john",
			chapter: 1,
			verse: 1,
		},
	],
	rationale: {
		en: "Fixture rationale, not a scholarly claim.",
		es: "Fixture rationale es, not a scholarly claim.",
	},
	attribution: { credit: "Fixture credit", locator: "Fixture locator" },
	provenance: {
		source_id: "fixture",
		path: "fixture.json",
		json_pointer: "/fixture",
		origin: "authored",
		transformation: "imported",
	},
	review: {
		status: "approved",
		reviewer: { name: "Fixture Reviewer" },
		reviewed_on: "2026-01-01",
	},
});

const catalog = createContextualRelationships({
	schema: "davar-contextual-relationships-v1",
	relationships: [
		fixture("fixture-a", "G9901", "H9901"),
		fixture("fixture-b", "G9902", "H9902"),
	],
});

test("an approved relationship shows its labels, identity, gloss, and provenance", async () => {
	const view = render(
		<ContextualRelatedSection
			strong="G9901"
			verse={JOHN_1_1}
			language="en"
			catalog={catalog}
			glossSource={async () => "fixture gloss"}
		/>,
	);
	await view.findByText("Contextual cross-language relationship");
	for (const text of [
		"In John 1:1 only",
		"Hebrew",
		"fixture-lemma-H9901",
		"Fixture gloss",
		"Not a translation or synonym",
		"Why related",
		"Fixture rationale, not a scholarly claim.",
		"Fixture credit",
		"Fixture locator",
		"Reviewed by Fixture Reviewer",
	]) {
		expect(view.getByText(text)).toBeTruthy();
	}
});

test("an empty result renders no heading and no placeholder", async () => {
	let settled = false;
	const { container } = render(
		<ContextualRelatedSection
			strong="G9901"
			verse={JOHN_1_1}
			language="en"
			catalog={catalog}
			glossSource={async () => {
				settled = true;
				return null;
			}}
		/>,
	);
	await waitFor(() => expect(settled).toBe(true));
	await act(async () => {});
	expect(container.innerHTML).toBe("");
});

test("a late response for a prior word is discarded", async () => {
	const pending = new Map<string, (gloss: string) => void>();
	const glossSource = (strong: string) =>
		new Promise<string>((resolve) => pending.set(strong, resolve));
	const props = { verse: JOHN_1_1, language: "en", catalog, glossSource } as const;
	const view = render(<ContextualRelatedSection strong="G9901" {...props} />);
	await waitFor(() => expect(pending.has("H9901")).toBe(true));
	view.rerender(<ContextualRelatedSection strong="G9902" {...props} />);
	await waitFor(() => expect(pending.has("H9902")).toBe(true));

	await act(async () => pending.get("H9902")?.("current gloss"));
	await view.findByText("Current gloss");
	await act(async () => pending.get("H9901")?.("stale gloss"));

	expect(view.queryByText("Stale gloss")).toBeNull();
	expect(view.getByText("fixture-lemma-H9902")).toBeTruthy();
	expect(view.queryByText("fixture-lemma-H9901")).toBeNull();
});
