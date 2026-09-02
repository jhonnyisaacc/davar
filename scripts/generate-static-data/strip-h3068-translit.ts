import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { WEB_PUBLIC_DATA_ROOT } from "./config";

type JsonObject = { [k: string]: unknown };

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const strip = (entry: JsonObject): void => {
  delete entry.translit_en;
  delete entry.translit_es;
};

const main = async (): Promise<void> => {
  const wordsPath = join(WEB_PUBLIC_DATA_ROOT, "dict", "words.json");
  const wordsRaw = await readFile(wordsPath, "utf-8");
  const words = JSON.parse(wordsRaw) as unknown;
  if (!isObject(words) || !isObject(words.H3068)) {
    throw new Error("words.json is missing H3068");
  }
  strip(words.H3068);
  await writeFile(wordsPath, JSON.stringify(words), "utf-8");
};

main().catch((error) => {
  console.error("strip-h3068-translit failed", error);
  process.exit(1);
});
