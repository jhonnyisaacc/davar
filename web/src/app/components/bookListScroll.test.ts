import { expect, test } from "bun:test";
import { centeredListScrollTop } from "./bookListScroll";

test("centering the last book moves only the list, and clamps the first book", () => {
	expect(
		centeredListScrollTop({
			listTop: 80,
			listHeight: 400,
			buttonTop: 1800,
			buttonHeight: 32,
			scrollTop: 0,
		}),
	).toBe(1536);
	expect(
		centeredListScrollTop({
			listTop: 80,
			listHeight: 400,
			buttonTop: 80,
			buttonHeight: 32,
			scrollTop: 0,
		}),
	).toBe(0);
});
