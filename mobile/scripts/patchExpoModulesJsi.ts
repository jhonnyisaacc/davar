import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const publishedSwiftInterfaceSed = String.raw`/^extension __ObjC\./,/^}/d;/^@usableFromInline$/{N;/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d;};/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d`;

export const patchedSwiftInterfaceSed = String.raw`/^extension __ObjC(\.|::)/,/^}/d;/^@usableFromInline$/{N;/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d;};/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d`;

const publishedInvocation = `sed '${publishedSwiftInterfaceSed}'`;
const patchedInvocation = `sed -E '${patchedSwiftInterfaceSed}'`;

export type PatchStatus = "patched" | "current" | "missing";

export function patchBuildScript(source: string): {
  source: string;
  status: "patched" | "current" | "unrecognized";
} {
  if (source.includes(patchedInvocation)) {
    return { source, status: "current" };
  }
  if (!source.includes(publishedInvocation)) {
    return { source, status: "unrecognized" };
  }
  return {
    source: source.replaceAll(publishedInvocation, patchedInvocation),
    status: "patched",
  };
}

export function expoModulesJsiScriptCandidates(mobileRoot: string): string[] {
  return [
    join(
      mobileRoot,
      "node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
    ),
    join(
      mobileRoot,
      "../node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
    ),
    join(mobileRoot, "ios/Pods/ExpoModulesJSI/scripts/build-xcframework.sh"),
  ];
}

export function patchInstalledExpoModulesJsi(mobileRoot: string): PatchStatus {
  const seen = new Set<string>();
  const unrecognized: string[] = [];
  let found = false;
  let patched = false;

  for (const candidate of expoModulesJsiScriptCandidates(mobileRoot)) {
    if (!existsSync(candidate)) continue;
    const real = realpathSync(candidate);
    if (seen.has(real)) continue;
    seen.add(real);
    found = true;
    const next = patchBuildScript(readFileSync(real, "utf8"));
    if (next.status === "unrecognized") {
      unrecognized.push(real);
      continue;
    }
    if (next.status === "patched") {
      writeFileSync(real, next.source);
      patched = true;
    }
  }

  if (unrecognized.length > 0) {
    throw new Error(
      `expo-modules-jsi build script does not have the 57.1.x sed line: ${unrecognized.join(", ")}`,
    );
  }
  if (!found) return "missing";
  return patched ? "patched" : "current";
}

if (import.meta.main) {
  const mobileRoot = join(import.meta.dir, "..");
  try {
    const status = patchInstalledExpoModulesJsi(mobileRoot);
    if (status === "missing") {
      console.log(
        "expo-modules-jsi is not installed. Skipping the Swift 6.4 interface patch.",
      );
    } else if (status === "patched") {
      console.log(
        "Patched expo-modules-jsi so the Swift interface drops __ObjC::expo extensions.",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
