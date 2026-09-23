import { expect, test } from "bun:test";
import {
  CANONICAL_BOOK_ORDER,
  DELITZSCH_TO_ENGLISH,
  OE_TO_ENGLISH,
  TTH_BOOK_MAPPING,
} from "../../shared/books";
import { TTH_BOOK_MAPPING as translationMapping } from "../../shared/translationConfig";
import {
  CANONICAL_BOOK_ORDER as staticOrder,
  DELITZSCH_TO_ENGLISH as staticDelitzsch,
  OE_TO_ENGLISH as staticOe,
} from "./config";

test("static data and translation config read the book registry", () => {
  expect(translationMapping).toEqual(TTH_BOOK_MAPPING);
  expect(staticOrder).toEqual(CANONICAL_BOOK_ORDER);
  expect(staticDelitzsch).toEqual(DELITZSCH_TO_ENGLISH);
  expect(staticOe).toEqual(OE_TO_ENGLISH);
  expect(CANONICAL_BOOK_ORDER).toHaveLength(66);
  expect(CANONICAL_BOOK_ORDER[29]).toBe("SongOfSolomon");
  expect(TTH_BOOK_MAPPING.SongOfSolomon).toBe("shir_hashirim");
  expect(TTH_BOOK_MAPPING.Galatians).toBe("galatas");
  expect(TTH_BOOK_MAPPING.Obadiah).toBeUndefined();
  expect(Object.keys(TTH_BOOK_MAPPING)).toHaveLength(36);
  expect(Object.keys(DELITZSCH_TO_ENGLISH)).toHaveLength(27);
  expect(Object.keys(OE_TO_ENGLISH)).toHaveLength(39);
  expect(staticOe.isamuel).toBe("Samuel1");
});
