import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { patchInstalledExpoModulesJsi } from "./patchExpoModulesJsi";

export function swiftNeedsSourceBuiltModules(swiftcVersion: string): boolean {
  const match = swiftcVersion.match(/Swift version (\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 6 || (major === 6 && minor >= 4);
}

export function readSwiftcVersion(): string {
  const result = spawnSync("xcrun", ["swiftc", "--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function runExpo(
  mobileRoot: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): number {
  const expo = join(mobileRoot, "node_modules/.bin/expo");
  const result = spawnSync(expo, args, {
    cwd: mobileRoot,
    env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

if (import.meta.main) {
  const mobileRoot = join(import.meta.dir, "..");
  try {
    patchInstalledExpoModulesJsi(mobileRoot);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const clean = process.argv[2] === "clean";
  const extra = process.argv.slice(clean ? 3 : 2);
  const env = { ...process.env };
  if (swiftNeedsSourceBuiltModules(readSwiftcVersion())) {
    env.EXPO_USE_PRECOMPILED_MODULES = "0";
    console.log(
      "Swift 6.4 or newer is installed. Expo modules will build from source.",
    );
  }

  if (clean) {
    const prebuild = runExpo(
      mobileRoot,
      ["prebuild", "--clean", "--platform", "ios", "--no-install"],
      env,
    );
    if (prebuild !== 0) process.exit(prebuild);
    process.exit(
      runExpo(
        mobileRoot,
        ["run:ios", "--port", "8081", "--no-build-cache", ...extra],
        env,
      ),
    );
  }

  process.exit(
    runExpo(mobileRoot, ["run:ios", "--port", "8081", ...extra], env),
  );
}
