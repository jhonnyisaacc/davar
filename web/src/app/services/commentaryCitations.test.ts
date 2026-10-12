import { expect, test } from "bun:test";
import { commentaryCitationLabel } from "@davar/shared/commentaryCitations";

test("Shaul citations show source-owned titles and section labels", () => {
	expect(
		commentaryCitationLabel({
			source_id: "shaul:note",
			source_url: "https://example.test/note",
			revision: "pinned",
			attribution: "Original author",
			title: "Original note",
			section_labels: ["Introduction", "Scope", "Cautions"],
		}),
	).toBe("Original note — Scope · Cautions");
});
