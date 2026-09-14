import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GREEK_RECORDED_REVISION } from "../../shared/greekBesorah";
import { DATA_ROOT, WEB_PUBLIC_DATA_ROOT } from "./config";

export const COMMITTED_GREEK_PREVIEW_ROOT = join(
  DATA_ROOT,
  "greek",
  "preview",
);

export type GreekPublicStash = {
  dir: string;
  revision: string;
  ephemeral?: boolean;
};

type GreekManifest = {
  revision?: string;
  complete?: boolean;
  validated?: boolean;
};

export const shouldKeepGreekPublicData = (
  manifest: GreekManifest,
  recordedRevision = GREEK_RECORDED_REVISION,
): boolean =>
  manifest.revision === recordedRevision &&
  manifest.complete === true &&
  manifest.validated === true;

const readGreekManifest = (greekDir: string): GreekManifest | null => {
  const manifestPath = join(greekDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as GreekManifest;
  } catch {
    return null;
  }
};

const copyGreekTree = (sourceDir: string, destDir: string): void => {
  const greekDir = join(sourceDir, "greek");
  if (existsSync(greekDir)) {
    cpSync(greekDir, join(destDir, "greek"), { recursive: true });
  }
  const bundleDir = join(sourceDir, "greek-sblgnt");
  if (existsSync(bundleDir)) {
    cpSync(bundleDir, join(destDir, "greek-sblgnt"), { recursive: true });
  }
  const bundleIndex = join(sourceDir, "greek-sblgnt.json");
  if (existsSync(bundleIndex)) {
    cpSync(bundleIndex, join(destDir, "greek-sblgnt.json"));
  }
};

export const stashCurrentGreekPublicData = (): GreekPublicStash | null => {
  const greekDir = join(WEB_PUBLIC_DATA_ROOT, "greek");
  const manifest = readGreekManifest(greekDir);
  if (!manifest || !shouldKeepGreekPublicData(manifest) || !manifest.revision) {
    if (existsSync(join(greekDir, "manifest.json"))) {
      console.log(
        `[davar-static-data] greek-preview=stale revision=${manifest?.revision ?? "missing"} recorded=${GREEK_RECORDED_REVISION}`,
      );
    }
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), "davar-greek-public-"));
  cpSync(greekDir, join(dir, "greek"), { recursive: true });
  const bundleDir = join(WEB_PUBLIC_DATA_ROOT, "bundles", "greek-sblgnt");
  const bundleIndex = join(WEB_PUBLIC_DATA_ROOT, "bundles", "greek-sblgnt.json");
  if (existsSync(bundleDir)) {
    cpSync(bundleDir, join(dir, "greek-sblgnt"), { recursive: true });
  }
  if (existsSync(bundleIndex)) {
    cpSync(bundleIndex, join(dir, "greek-sblgnt.json"));
  }
  console.log(
    `[davar-static-data] greek-preview=keep revision=${manifest.revision}`,
  );
  return { dir, revision: manifest.revision, ephemeral: true };
};

export const loadCommittedGreekPreview = (): GreekPublicStash | null => {
  const greekDir = join(COMMITTED_GREEK_PREVIEW_ROOT, "greek");
  const manifest = readGreekManifest(greekDir);
  if (!manifest || !shouldKeepGreekPublicData(manifest) || !manifest.revision) {
    return null;
  }
  console.log(
    `[davar-static-data] greek-preview=committed revision=${manifest.revision}`,
  );
  return {
    dir: COMMITTED_GREEK_PREVIEW_ROOT,
    revision: manifest.revision,
    ephemeral: false,
  };
};

export const resolveGreekPublicData = (): GreekPublicStash | null =>
  stashCurrentGreekPublicData() ?? loadCommittedGreekPreview();

export const restoreGreekPublicData = (
  stash: GreekPublicStash | null,
): void => {
  if (!stash) {
    return;
  }
  try {
    const greekDir = join(stash.dir, "greek");
    if (existsSync(greekDir)) {
      cpSync(greekDir, join(WEB_PUBLIC_DATA_ROOT, "greek"), { recursive: true });
    }
    const bundleDir = join(stash.dir, "greek-sblgnt");
    if (existsSync(bundleDir)) {
      cpSync(bundleDir, join(WEB_PUBLIC_DATA_ROOT, "bundles", "greek-sblgnt"), {
        recursive: true,
      });
    }
    const bundleIndex = join(stash.dir, "greek-sblgnt.json");
    if (existsSync(bundleIndex)) {
      cpSync(
        bundleIndex,
        join(WEB_PUBLIC_DATA_ROOT, "bundles", "greek-sblgnt.json"),
      );
    }
  } finally {
    if (stash.ephemeral) {
      rmSync(stash.dir, { recursive: true, force: true });
    }
  }
};

export const mergeGreekBundleVersion = (
  versions: Record<string, number>,
  stash: GreekPublicStash | null,
): Record<string, number> => {
  if (!stash) {
    return versions;
  }
  return {
    ...versions,
    [`greek:sblgnt:${stash.revision}`]: 1,
  };
};
