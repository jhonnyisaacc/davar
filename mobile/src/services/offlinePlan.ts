import {
  GREEK_RECORDED_REVISION,
  greekBundleKey,
  type BesorahLanguage,
} from "@davar/shared/greekBesorah";

export type BundleVersions = Record<string, number>;

export type BundleUpdatePlan = {
  translationDataset: "tth" | null;
  greekDataset: string | null;
  needs: {
    tanaj: boolean;
    besorah: boolean;
    translation: boolean;
    dictionary: boolean;
    dss: boolean;
    greek: boolean;
  };
};

export const getBundleUpdatePlan = (
  language: "es" | "en",
  localVersions: BundleVersions,
  remoteVersions: BundleVersions,
  options?: {
    besorahLanguage?: BesorahLanguage;
    greekRevision?: string;
  },
): BundleUpdatePlan => {
  // TS2009 is served as static chapter JSON and is intentionally online-only.
  const translationDataset = language === "es" ? "tth" : null;
  const greekDataset =
    options?.besorahLanguage === "greek"
      ? greekBundleKey(options.greekRevision ?? GREEK_RECORDED_REVISION)
      : null;

  return {
    translationDataset,
    greekDataset,
    needs: {
      tanaj: (remoteVersions.tanaj ?? 0) > (localVersions.tanaj ?? 0),
      besorah: (remoteVersions.besorah ?? 0) > (localVersions.besorah ?? 0),
      translation:
        translationDataset !== null &&
        (remoteVersions[translationDataset] ?? 0) >
          (localVersions[translationDataset] ?? 0),
      dictionary:
        (remoteVersions.dictionary ?? 0) > (localVersions.dictionary ?? 0),
      dss: (remoteVersions.dss ?? 0) > (localVersions.dss ?? 0),
      greek:
        greekDataset !== null &&
        (remoteVersions[greekDataset] ?? 0) >
          (localVersions[greekDataset] ?? 0),
    },
  };
};
