import registry from "../data/knowledge/registries/books.json";

export type BookRecord = {
  id: string;
  order: number;
  name: string;
  section: string;
  chapters: number;
  hebrew_name: string;
  hebrew_transliteration: string;
  spanish_name: string;
  usfx: string;
  oe?: string;
  tagnt?: string;
  dss?: { xml: string; name: string; index: number };
  dict?: {
    normalized: string;
    book_id: string;
    es: string;
    en: string;
    ts2009: string;
    tth: string | null;
    morphhb: string;
  };
  ts2009: {
    number: number;
    anglicized: string;
    hebrew: string;
    english: string;
    spanish: string;
    section: string;
    expected_chapters: number;
  };
  tth?: {
    code: string;
    tth_name: string;
    hebrew_name: string;
    english_name: string;
    spanish_name: string;
    book_code: string;
  };
};

export const BOOKS = registry as BookRecord[];

export const CANONICAL_BOOK_ORDER: string[] = BOOKS.map((book) => book.name);

export const OE_TO_ENGLISH: Record<string, string> = Object.fromEntries(
  BOOKS.filter((book) => book.oe).map((book) => [book.oe as string, book.name]),
);

export const DELITZSCH_TO_ENGLISH: Record<string, string> = Object.fromEntries(
  BOOKS.filter((book) => book.section === "besorah").map((book) => [
    book.id,
    book.name,
  ]),
);

export const TTH_BOOK_MAPPING: Record<string, string> = Object.fromEntries(
  BOOKS.filter((book) => book.tth).map((book) => [
    book.name,
    (book.tth as NonNullable<BookRecord["tth"]>).code,
  ]),
);
