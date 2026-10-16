import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { swiftNeedsSourceBuiltModules } from "./ios";
import {
  patchedSwiftInterfaceSed,
  patchBuildScript,
  patchInstalledExpoModulesJsi,
  publishedSwiftInterfaceSed,
} from "./patchExpoModulesJsi";

const fixture = `public func keepMe()
extension __ObjC.expo.CppError : Swift.Error {
  public var oldForm: Swift.Int {
    get
  }
}
extension __ObjC::expo.__ObjC::CppError : Swift.Error {
  public var newForm: Swift.Int {
    get
  }
}
public func stillHere()
`;

function strip(program: string, input: string, extended = false): string {
  const dir = mkdtempSync(join(tmpdir(), "jsi-interface-"));
  const file = join(dir, "ExpoModulesJSI.swiftinterface");
  writeFileSync(file, input);
  const args = extended ? ["-E", program, file] : [program, file];
  const result = spawnSync("sed", args, { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "sed failed");
  }
  return result.stdout;
}

function writeScript(mobileRoot: string, relativePath: string, source: string) {
  const script = join(mobileRoot, relativePath);
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, source);
  return script;
}

const publishedScript = `sed '${publishedSwiftInterfaceSed}' "$swiftinterface"\n`;

describe("ExpoModulesJSI swiftinterface", () => {
  test("the published 57.1.1 sed keeps the Swift 6.4 extension", () => {
    const stripped = strip(publishedSwiftInterfaceSed, fixture);
    expect(stripped).toContain("__ObjC::expo");
    expect(stripped).not.toContain("__ObjC.expo.CppError");
  });

  test("drops the Swift 6.4 __ObjC::expo extension", () => {
    const stripped = strip(patchedSwiftInterfaceSed, fixture, true);
    expect(stripped).toContain("public func keepMe()");
    expect(stripped).toContain("public func stillHere()");
    expect(stripped).not.toContain("__ObjC::expo");
    expect(stripped).not.toContain("__ObjC.expo");
  });
});

describe("patchExpoModulesJsi", () => {
  test("rewrites the published sed and leaves a patched script alone", () => {
    const mobileRoot = mkdtempSync(join(tmpdir(), "jsi-patch-"));
    const script = writeScript(
      mobileRoot,
      "node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
      publishedScript,
    );
    expect(patchInstalledExpoModulesJsi(mobileRoot)).toBe("patched");
    const patched = readFileSync(script, "utf8");
    expect(patched).toContain(`sed -E '${patchedSwiftInterfaceSed}'`);
    expect(patchInstalledExpoModulesJsi(mobileRoot)).toBe("current");
    expect(readFileSync(script, "utf8")).toBe(patched);
    rmSync(mobileRoot, { recursive: true, force: true });
  });

  test("patches a Pods copy and a node_modules symlink once", () => {
    const mobileRoot = mkdtempSync(join(tmpdir(), "jsi-pods-"));
    const script = writeScript(
      mobileRoot,
      "node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
      publishedScript,
    );
    const pods = join(
      mobileRoot,
      "ios/Pods/ExpoModulesJSI/scripts/build-xcframework.sh",
    );
    mkdirSync(dirname(pods), { recursive: true });
    symlinkSync(script, pods);
    expect(patchInstalledExpoModulesJsi(mobileRoot)).toBe("patched");
    expect(readFileSync(script, "utf8")).toContain("sed -E");
    expect(readFileSync(pods, "utf8")).toContain("__ObjC(\\.|::)");
    rmSync(mobileRoot, { recursive: true, force: true });
  });

  test("refuses a build script whose sed line moved", () => {
    const mobileRoot = mkdtempSync(join(tmpdir(), "jsi-unknown-"));
    writeScript(
      mobileRoot,
      "node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
      "sed '/^extension SomethingElse/,/^}/d'\n",
    );
    expect(() => patchInstalledExpoModulesJsi(mobileRoot)).toThrow(/57\.1\.x/);
    rmSync(mobileRoot, { recursive: true, force: true });
  });

  test("does nothing when expo-modules-jsi is absent", () => {
    const mobileRoot = mkdtempSync(join(tmpdir(), "jsi-missing-"));
    expect(patchInstalledExpoModulesJsi(mobileRoot)).toBe("missing");
    rmSync(mobileRoot, { recursive: true, force: true });
  });

  test("recognizes the installed expo-modules-jsi script", () => {
    const installed = join(
      import.meta.dir,
      "../node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh",
    );
    if (!existsSync(installed)) return;
    expect(patchBuildScript(readFileSync(installed, "utf8")).status).not.toBe(
      "unrecognized",
    );
  });
});

describe("swiftNeedsSourceBuiltModules", () => {
  test("builds from source on Swift 6.4 and newer", () => {
    expect(
      swiftNeedsSourceBuiltModules(
        "Apple Swift version 6.4 (swiftlang-6.4.0.34.1 clang-2100.0.123.1)",
      ),
    ).toBe(true);
    expect(
      swiftNeedsSourceBuiltModules(
        "Apple Swift version 6.3.1 (swiftlang-6.3.1)",
      ),
    ).toBe(false);
    expect(swiftNeedsSourceBuiltModules("Apple Swift version 7.0")).toBe(true);
    expect(swiftNeedsSourceBuiltModules("")).toBe(false);
  });
});
