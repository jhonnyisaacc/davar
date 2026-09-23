import { join } from "path";
import {
  CANONICAL_BOOK_ORDER,
  DELITZSCH_TO_ENGLISH,
  OE_TO_ENGLISH,
} from "../../shared/books";

export { CANONICAL_BOOK_ORDER, DELITZSCH_TO_ENGLISH, OE_TO_ENGLISH };

export const PROJECT_ROOT = join(import.meta.dir, "..", "..");
export const DATA_ROOT = join(PROJECT_ROOT, "data");
export const WEB_PUBLIC_DATA_ROOT = join(PROJECT_ROOT, "web", "public", "data");

export const BUNDLE_VERSIONS: Record<string, number> = {
  tanaj: 1,
  besorah: 1,
  dss: 1,
  dictionary: 2,
  tth: 1,
  ts2009: 1,
  hutter: 1,
};
