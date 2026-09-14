import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GREEK_RECORDED_REVISION } from "../../shared/greekBesorah";
import { WEB_PUBLIC_DATA_ROOT } from "./config";

export type GreekPublicStash = {
  dir: string;
  revision: string;
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

export const stashCurrentGreekPublicData = (): GreekPublicStash | null => {
  const greekDir = join(WEB_PUBLIC_DATA_ROOT, "greek");
  const manifestPath = join(greekDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  let manifest: GreekManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as GreekManifest;
  } catch {
    return null;
  }
  if (!shouldKeepGreekPublicData(manifest) || !manifest.revision) {
    console.log(
      `[davar-static-data] greek-preview=stale revision=${manifest.revision ?? "missing"} recorded=${GREEK_RECORDED_REVISION}`,
    );
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
  return { dir, revision: manifest.revision };
};

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
    rmSync(stash.dir, { recursive: true, force: true });
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
