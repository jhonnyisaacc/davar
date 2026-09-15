export type RouteScreen =
  | "home"
  | "verse"
  | "settings"
  | "donate"
  | "features"
  | "terms"
  | "privacy"
  | "feedback"
  | "notFound"
  | "connectionError";

export type RouteState = {
  screen: RouteScreen;
  book?: string;
  chapter?: number;
  verse?: number;
};

export const findCanonicalBook = <T extends { name: string }>(
  books: T[],
  requestedBook?: string,
): T | undefined => {
  if (!requestedBook) return undefined;
  const target = requestedBook.toLowerCase();
  return books.find((book) => book.name.toLowerCase() === target);
};

export const buildRoutePath = (route: RouteState): string => {
  switch (route.screen) {
    case "home":
      return "/home";
    case "terms":
      return "/terms";
    case "privacy":
      return "/privacy";
    case "feedback":
      return "/feedback";
    case "donate":
      return "/donate";
    case "features":
      return "/features";
    case "settings":
      return "/settings";
    case "verse": {
      const book = route.book ? encodeURIComponent(route.book) : "";
      const chapter = route.chapter ?? 1;
      const verse = route.verse ?? 1;
      return book ? `/verse/${book}/${chapter}/${verse}` : "/";
    }
    default:
      return "/";
  }
};

export const parseRoutePath = (pathname: string): RouteState | null => {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  const parts = trimmed.split("/").filter(Boolean);

  if (parts.length === 0) return { screen: "verse" };

  const [root, book, chapter, verse] = parts;
  if (root === "home") return { screen: "home" };
  if (root === "terms") return { screen: "terms" };
  if (root === "privacy") return { screen: "privacy" };
  if (root === "feedback") return { screen: "feedback" };
  if (root === "donate") return { screen: "donate" };
  if (root === "features") return { screen: "features" };
  if (root === "settings") return { screen: "settings" };

  if (root === "verse") {
    const decodedBook = book ? decodeURIComponent(book) : undefined;
    const parsedChapter = chapter ? Number.parseInt(chapter, 10) : undefined;
    const parsedVerse = verse ? Number.parseInt(verse, 10) : undefined;
    return {
      screen: "verse",
      book: decodedBook,
      chapter: Number.isNaN(parsedChapter) ? undefined : parsedChapter,
      verse: Number.isNaN(parsedVerse) ? undefined : parsedVerse,
    };
  }

  return null;
};
