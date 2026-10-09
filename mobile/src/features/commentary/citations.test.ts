// eslint-disable-next-line import/no-unresolved -- Bun test runner built-in
import { expect, test } from "bun:test";
import { commentaryCitationLabel } from "@davar/shared/commentaryCitations";

test("Shaul citations support source titles and sections without article IDs", () => {
	expect(
		commentaryCitationLabel({
			source_id: "shaul:note",
			source_url: "https://example.test/note",
			revision: "pinned",
			attribution: "Author",
			title: "Original note",
			section_labels: ["Introduction", "Scope", "Cautions"],
		}),
	).toBe("Original note — Scope · Cautions");
});

test("existing article citations keep their attribution label", () => {
	expect(
		commentaryCitationLabel({
			article_id: "article",
			source_id: "old",
			source_url: "https://example.test/article",
			revision: "1",
			attribution: "Original author",
		}),
	).toBe("Original author");
});
