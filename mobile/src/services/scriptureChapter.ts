import type { BesorahTextVersion } from "@davar/shared/translationConfig";
import type { DisplayVerse, ReferenceMode } from "./scriptureDisplay";
import { fetchChapterVersesOffline } from "./scriptureSqlite";
import { fetchChapterVersesStatic } from "./scriptureStatic";

export const fetchChapterVerses = async (
  bookId: string,
  chapter: number,
  options?: {
    language?: "en" | "es";
    showDss?: boolean;
    hebrewOnly?: boolean;
    isConnected?: boolean;
    referenceMode?: ReferenceMode;
    besorahTextVersion?: BesorahTextVersion;
  },
): Promise<DisplayVerse[]> => {
  // If explicitly offline, go straight to SQLite
  if (options?.isConnected === false) {
    return fetchChapterVersesOffline(bookId, chapter, options);
  }

  // Try static data first, fall back to SQLite on failure
  try {
    return await fetchChapterVersesStatic(bookId, chapter, options);
  } catch (staticError) {
    // Static fetch failed — try offline data as fallback
    console.debug(
      `Static fetch failed for ${bookId}/${chapter}, trying offline:`,
      staticError,
    );
    try {
      return await fetchChapterVersesOffline(bookId, chapter, options);
    } catch (offlineError) {
      const staticMessage =
        staticError instanceof Error
          ? staticError.message
          : String(staticError);
      const offlineMessage =
        offlineError instanceof Error
          ? offlineError.message
          : String(offlineError);
      throw new Error(
        `${staticMessage} | Offline fallback failed: ${offlineMessage}`,
      );
    }
  }
};
