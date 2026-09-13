export type ScriptureSourceLanguage = "hebrew" | "greek";
export type BesorahLanguage = ScriptureSourceLanguage;
export type GreekEdition = "sblgnt";
export type StrongNamespace = "G" | "H" | "D";

export const GREEK_EDITION: GreekEdition = "sblgnt";
export const GREEK_TAGGING_SOURCE = "stepbible-tagnt";
export const GREEK_RECORDED_REVISION =
  "ae39711d7843b2902d54993e432de9c12d6a4b9a";
export const GREEK_TRANSLITERATION_VERSION = "greek-transliteration-v1";
export const GREEK_PREVIEW_BRANCH = "feat/greek_besorah";

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

export const greekOccurrencesPath = (
  revision = GREEK_RECORDED_REVISION,
): string => `${greekReleaseBasePath(revision)}/occurrences.json`;

export const greekBundleKey = (
  revision = GREEK_RECORDED_REVISION,
): string => `greek:${GREEK_EDITION}:${revision}`;

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

export const isGreekPreviewBuild = (env: {
  PUBLIC_GREEK_PREVIEW_ENABLED?: string;
  CF_PAGES_BRANCH?: string;
}): boolean =>
  env.PUBLIC_GREEK_PREVIEW_ENABLED === "1" ||
  env.CF_PAGES_BRANCH === GREEK_PREVIEW_BRANCH;
