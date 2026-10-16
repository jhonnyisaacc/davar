import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

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

const publishedSed = String.raw`/^extension __ObjC\./,/^}/d;/^@usableFromInline$/{N;/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d;};/_ConstraintThatIsNotPartOfTheAPIOfThisLibrary/d`;

function strip(program: string, input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "jsi-interface-"));
  const file = join(dir, "ExpoModulesJSI.swiftinterface");
  writeFileSync(file, input);
  const result = spawnSync("sed", [program, file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "sed failed");
  }
  return result.stdout;
}

describe("ExpoModulesJSI swiftinterface", () => {
  test("drops the Swift 6.4 __ObjC::expo extension", () => {
    const stripped = strip(publishedSed, fixture);
    expect(stripped).toContain("public func keepMe()");
    expect(stripped).toContain("public func stillHere()");
    expect(stripped).not.toContain("__ObjC::expo");
  });
});
