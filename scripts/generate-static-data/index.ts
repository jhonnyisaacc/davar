import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const source = ["01", "02", "03", "04", "05"]
  .map((part) => readFileSync(join(dir, `index.part${part}.txt`), "utf8"))
  .join("");
const restoredPath = join(dir, ".index.full.ts");
writeFileSync(restoredPath, source, "utf8");

const generate = Bun.spawnSync(["bun", restoredPath], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(generate.exitCode ?? 1);
