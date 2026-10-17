import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { repoDataResponse } from "@davar/shared/repoDataResponse";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const offline = {
  hebrew: [] as unknown[],
  translation: [] as unknown[],
};

mock.module("react-native", () => ({
  NativeModules: {
    SourceCode: { scriptURL: "http://localhost:8081/index.bundle" },
  },
  Platform: { OS: "ios" },
}));

mock.module("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    getAllAsync: async (sql: string) => {
      if (sql.includes("hebrew_verses")) return offline.hebrew;
      if (sql.includes("dss_variants")) return [];
      if (sql.includes("FROM verses")) return offline.translation;
      return [];
    },
    runAsync: async () => undefined,
  }),
}));

const { readChapterSourceFirst } = await import("./scripture");
const { resetStaticDataRequestCachesForTests } = await import("./api");
const { resetTs2009ChapterCacheForTests } = await import("./scriptureTs2009");

const dataRoot = new URL("../../../data/", import.meta.url);
const firstLine = "A Psalm of David, when he fled.";
const secondLine = "O LORD, how many are my foes.";

const hebrewRow = (verse: number, text: string) => ({
  book: "psalms",
  chapter: 3,
  verse,
  words: JSON.stringify([{ text, strong: "H1", position: 1 }]),
});

let releaseTranslation: () => void = () => undefined;
let translationGate = Promise.resolve();
let requestedPaths: string[] = [];
let originalFetch: typeof fetch;

const isTranslationPath = (pathname: string) =>
  pathname.includes("/ts2009/") ||
  pathname.includes("/tth/") ||
  pathname.includes("/bes/");

const waitForSource = async (
  source: Promise<{
    verses: { verse: number; translation: string; hebrew: string }[];
    translationPending: boolean;
  }>,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      source,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("source waited on the translation file")),
          1000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const readPsalms3 = () =>
  readChapterSourceFirst("psalms", 3, {
    language: "en",
    isConnected: true,
    referenceMode: "source",
  });

const paintWhileTranslationHolds = async () => {
  const read = readPsalms3();
  try {
    return { read, painted: await waitForSource(read.source) };
  } finally {
    releaseTranslation();
  }
};

const expectShiftedTranslation = (
  verses: { verse: number; translation: string }[],
) => {
  expect(verses.find((verse) => verse.verse === 2)?.translation).toBe(
    firstLine,
  );
  expect(verses.find((verse) => verse.verse === 3)?.translation).toBe(
    secondLine,
  );
  expect(verses.find((verse) => verse.verse === 1)?.translation).not.toBe(
    firstLine,
  );
  expect(verses.find((verse) => verse.verse === 1)?.translation).not.toBe(
    secondLine,
  );
};

beforeEach(() => {
  offline.hebrew = [];
  offline.translation = [];
  requestedPaths = [];
  translationGate = new Promise<void>((resolve) => {
    releaseTranslation = resolve;
  });
  resetStaticDataRequestCachesForTests();
  resetTs2009ChapterCacheForTests();
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://davar.test");
    const pathname = decodeURIComponent(url.pathname);
    requestedPaths.push(pathname);
    if (pathname.endsWith("/version.json")) {
      return new Response("missing", { status: 404 });
    }
    if (isTranslationPath(pathname)) {
      await translationGate;
      if (pathname.includes("/ts2009/psalms/3.json")) {
        return new Response(
          JSON.stringify({
            verses: { "1": firstLine, "2": secondLine },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response("missing", { status: 404 });
    }
    return (
      (await repoDataResponse(pathname, dataRoot)) ??
      new Response("missing", { status: 404 })
    );
  }) as typeof fetch;
});

afterEach(() => {
  releaseTranslation();
  globalThis.fetch = originalFetch;
  resetStaticDataRequestCachesForTests();
  resetTs2009ChapterCacheForTests();
});

test("psalms 3 paints the Hebrew file before the translation file returns", async () => {
  const sourceFile = (await Bun.file(
    new URL("oe/psalms/3.json", dataRoot),
  ).json()) as { verse: number; hebrew: string }[];
  const { read, painted } = await paintWhileTranslationHolds();

  expect(painted.translationPending).toBe(true);
  expect(painted.verses.map((verse) => verse.verse)).toEqual(
    sourceFile.map((verse) => verse.verse),
  );
  expect(painted.verses.find((verse) => verse.verse === 1)?.hebrew).toContain(
    "מִזְמ֥וֹר",
  );
  expect(painted.verses.find((verse) => verse.verse === 1)?.translation).toBe(
    "",
  );
  expect(painted.verses.find((verse) => verse.verse === 2)?.translation).toBe(
    "",
  );
  expect(
    requestedPaths.some((path) => path.includes("/oe/psalms/3.json")),
  ).toBe(true);
  expect(requestedPaths.some((path) => path.includes("/ts2009/"))).toBe(true);

  const settled = await read.settled;
  expect(settled.map((verse) => verse.verse)).toEqual(
    painted.verses.map((verse) => verse.verse),
  );
  expectShiftedTranslation(settled);
});

test("a stored chapter paints Hebrew without requesting the Hebrew file", async () => {
  offline.hebrew = [
    hebrewRow(1, "STORED-ALEPH"),
    hebrewRow(2, "STORED-BET"),
    hebrewRow(3, "STORED-GIMEL"),
  ];
  const { read, painted } = await paintWhileTranslationHolds();

  expect(painted.translationPending).toBe(true);
  expect(painted.verses.find((verse) => verse.verse === 1)?.hebrew).toBe(
    "STORED-ALEPH",
  );
  expect(painted.verses.find((verse) => verse.verse === 2)?.hebrew).toBe(
    "STORED-BET",
  );
  expect(painted.verses.find((verse) => verse.verse === 1)?.translation).toBe(
    "",
  );
  expect(requestedPaths.some((path) => path.includes("/oe/"))).toBe(false);

  const settled = await read.settled;
  expect(settled.find((verse) => verse.verse === 1)?.hebrew).toBe(
    "STORED-ALEPH",
  );
  expectShiftedTranslation(settled);
  expect(requestedPaths.some((path) => path.includes("/oe/"))).toBe(false);
  expect(
    requestedPaths.some((path) => path.includes("/ts2009/psalms/3.json")),
  ).toBe(true);
});

test("a stored translation paints on the shifted verse without a network read", async () => {
  offline.hebrew = [
    hebrewRow(1, "STORED-ALEPH"),
    hebrewRow(2, "STORED-BET"),
    hebrewRow(3, "STORED-GIMEL"),
  ];
  offline.translation = [
    { chapter: 3, verse: 1, text: firstLine },
    { chapter: 3, verse: 2, text: secondLine },
  ];
  const read = readPsalms3();
  const painted = await waitForSource(read.source);

  expect(painted.translationPending).toBe(false);
  expectShiftedTranslation(painted.verses);
  expect(requestedPaths).toEqual([]);
  expect(
    (await read.settled).find((verse) => verse.verse === 2)?.translation,
  ).toBe(firstLine);
});
