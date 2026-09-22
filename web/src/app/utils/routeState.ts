import {
  DESTINATIONS,
  destinationById,
  type Destination,
  type DestinationId,
} from "../destinations";

export type RouteScreen = DestinationId;

export type RouteState = {
  screen: RouteScreen;
  book?: string;
  chapter?: number;
  verse?: number;
};

const verseDestination = destinationById("verse");
const verseRoot = verseDestination.path.split("/").filter(Boolean)[0] ?? "";

const destinationsByRoot = new Map<string, Destination>(
  DESTINATIONS.flatMap((destination) => {
    if (destination.id === verseDestination.id) return [];
    const segments = destination.path.split("/").filter(Boolean);
    const root = segments[0];
    if (!root || segments.length !== 1) return [];
    return [[root, destination]];
  }),
);

export const findCanonicalBook = <T extends { name: string }>(
  books: T[],
  requestedBook?: string,
): T | undefined => {
  if (!requestedBook) return undefined;
  const target = requestedBook.toLowerCase();
  return books.find((book) => book.name.toLowerCase() === target);
};

export const buildRoutePath = (route: RouteState): string => {
  if (route.screen === verseDestination.id) {
    const book = route.book ? encodeURIComponent(route.book) : "";
    const chapter = route.chapter ?? 1;
    const verse = route.verse ?? 1;
    return book ? `${verseDestination.path}/${book}/${chapter}/${verse}` : "/";
  }

  return destinationById(route.screen).path;
};

export const parseRoutePath = (pathname: string): RouteState | null => {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  const parts = trimmed.split("/").filter(Boolean);

  if (parts.length === 0) return { screen: verseDestination.id };

  const [root, book, chapter, verse] = parts;
  const destination = root ? destinationsByRoot.get(root) : undefined;
  if (destination) return { screen: destination.id };

  if (root === verseRoot) {
    const decodedBook = book ? decodeURIComponent(book) : undefined;
    const parsedChapter = chapter ? Number.parseInt(chapter, 10) : undefined;
    const parsedVerse = verse ? Number.parseInt(verse, 10) : undefined;
    return {
      screen: verseDestination.id,
      book: decodedBook,
      chapter: Number.isNaN(parsedChapter) ? undefined : parsedChapter,
      verse: Number.isNaN(parsedVerse) ? undefined : parsedVerse,
    };
  }

  return null;
};
