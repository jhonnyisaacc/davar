export type ScriptureSourceLanguage = "hebrew" | "greek";
export type BesorahLanguage = ScriptureSourceLanguage;
export type GreekEdition = "sblgnt";
export type StrongNamespace = "G" | "H" | "D";

export const GREEK_EDITION: GreekEdition = "sblgnt";
export const GREEK_TAGGING_SOURCE = "stepbible-tagnt";
export const GREEK_RECORDED_REVISION =
  "ae39711d7843b2902d54993e432de9c12d6a4b9a";
export const GREEK_TRANSLITERATION_VERSION = "greek-transliteration-v1";

export type SourceIdentity = {
  sourceLanguage: ScriptureSourceLanguage;
  edition: string;
  revision: string;
};

export type LocalizedLexicalText = {
  en?: string;
  es?: string;
  he?: string;
};

export type GreekOccurrenceShard = {
  checksum: string;
  path: string;
};

export type GreekReleaseManifest = {
  schema: "davar-greek-release-v1";
  edition: GreekEdition;
  revision: string;
  taggingRevision: string;
  transliterationVersion: string;
  complete: boolean;
  validated: boolean;
  publicEnabled: boolean;
  books: string[];
  occurrence_shards?: Record<string, GreekOccurrenceShard>;
  previousRevision?: string;
};

export const greekSourceIdentity = (
  revision = GREEK_RECORDED_REVISION,
): SourceIdentity => ({
  sourceLanguage: "greek",
  edition: GREEK_EDITION,
  revision,
});

export const sourceCacheKey = (
  identity: SourceIdentity,
  resource: string,
): string =>
  [
    identity.sourceLanguage,
    identity.edition,
    identity.revision,
    resource.replace(/^\/+/, ""),
  ].join(":");

export const greekReleaseBasePath = (
  revision = GREEK_RECORDED_REVISION,
): string => `greek/releases/${GREEK_EDITION}/${revision}`;

export const greekChapterPath = (
  book: string,
  chapter: number,
  revision = GREEK_RECORDED_REVISION,
): string =>
  `${greekReleaseBasePath(revision)}/books/${book}/${chapter}.json`;

export const greekLexiconPath = (
  revision = GREEK_RECORDED_REVISION,
): string => `${greekReleaseBasePath(revision)}/lexicon.json`;

export const greekOccurrenceShardKey = (strong: string): string => {
  const digits = (strong.match(/\d+/)?.[0] ?? "0").padStart(4, "0");
  return `G${digits.slice(0, 2)}`;
};

export const greekOccurrencesShardPath = (
  strong: string,
  revision = GREEK_RECORDED_REVISION,
): string =>
  `${greekReleaseBasePath(revision)}/occurrences/${greekOccurrenceShardKey(strong)}.json`;

export const greekOccurrencesPath = (
  revision = GREEK_RECORDED_REVISION,
): string => `${greekReleaseBasePath(revision)}/occurrences.json`;

export const greekBundleKey = (
  revision = GREEK_RECORDED_REVISION,
): string => `greek:${GREEK_EDITION}:${revision}`;

export const GREEK_BESORAH_BOOK_NAMES: Record<string, string> = {
  matthew: "Κατὰ Μαθθαῖον",
  mark: "Κατὰ Μᾶρκον",
  luke: "Κατὰ Λουκᾶν",
  john: "Κατὰ Ἰωάννην",
  acts: "Πράξεις",
  romans: "Πρὸς Ῥωμαίους",
  corinthians1: "Πρὸς Κορινθίους Αʹ",
  corinthians2: "Πρὸς Κορινθίους Βʹ",
  galatians: "Πρὸς Γαλάτας",
  ephesians: "Πρὸς Ἐφεσίους",
  philippians: "Πρὸς Φιλιππησίους",
  colossians: "Πρὸς Κολοσσαεῖς",
  thessalonians1: "Πρὸς Θεσσαλονικεῖς Αʹ",
  thessalonians2: "Πρὸς Θεσσαλονικεῖς Βʹ",
  timothy1: "Πρὸς Τιμόθεον Αʹ",
  timothy2: "Πρὸς Τιμόθεον Βʹ",
  titus: "Πρὸς Τίτον",
  philemon: "Πρὸς Φιλήμονα",
  hebrews: "Πρὸς Ἑβραίους",
  james: "Ἰακώβου",
  peter1: "Πέτρου Αʹ",
  peter2: "Πέτρου Βʹ",
  john1: "Ἰωάννου Αʹ",
  john2: "Ἰωάννου Βʹ",
  john3: "Ἰωάννου Γʹ",
  jude: "Ἰούδα",
  revelation: "Ἀποκάλυψις",
};

export const SOURCE_STRONG_PATTERN = /^[HGD]\d+[A-Za-z]?$/;

export const parseSourceStrong = (
  value?: string | null,
): string | undefined =>
  value
    ?.split("/")
    .map((part) => part.trim())
    .find((part) => SOURCE_STRONG_PATTERN.test(part));

export const greekStrongFamily = (strong: string): string => {
  const digits = strong.match(/\d+/)?.[0];
  return digits ? `G${digits.padStart(4, "0")}` : strong;
};

export const strongNamespace = (
  strong: string | null | undefined,
): StrongNamespace | null => {
  const match = strong?.trim().match(/^([GHD])\d+/);
  return (match?.[1] as StrongNamespace | undefined) ?? null;
};

export const assertStrongNamespace = (
  strong: string,
  sourceLanguage: ScriptureSourceLanguage,
): void => {
  const namespace = strongNamespace(strong);
  const valid =
    sourceLanguage === "greek"
      ? namespace === "G"
      : namespace === "H" || namespace === "D";
  if (!valid) {
    throw new Error(
      `${sourceLanguage} source cannot use Strong namespace ${namespace ?? "unknown"}: ${strong}`,
    );
  }
};

export const canActivateGreekRelease = (
  manifest: GreekReleaseManifest,
): boolean =>
  manifest.schema === "davar-greek-release-v1" &&
  manifest.edition === GREEK_EDITION &&
  manifest.complete &&
  manifest.validated &&
  manifest.books.length === 27;

export const isGreekBesorahEnabled = (env: {
  PUBLIC_GREEK_PREVIEW_ENABLED?: string;
  EXPO_PUBLIC_GREEK_PREVIEW_ENABLED?: string;
  PUBLIC_GREEK_PUBLIC_ENABLED?: string;
} = {}): boolean => {
  if (env.PUBLIC_GREEK_PUBLIC_ENABLED === "1") return true;
  const flag =
    env.PUBLIC_GREEK_PREVIEW_ENABLED ??
    env.EXPO_PUBLIC_GREEK_PREVIEW_ENABLED;
  return flag !== "0";
};

export const isGreekPreviewBuild = isGreekBesorahEnabled;
