const SURFACE_MARKS = /[¶§]/g;
const L_REF = /\{L:([^<{]+)(?:<[^>]*>)?\}(?:\[[a-z]\])?/gi;
const BRACE_REF = /\{[DNS]:[^}]+\}/g;
const SDBG = /<SDBG:[^>]+>/gi;
const UNDERSCORE_HEADING = /_{1,2}(?=(?:[IVXLC]+\.|\d+\.|\([a-z]\)))/g;
const BARE_UNDERSCORES = /_{2,}/g;

export const cleanGreekSurfaceText = (value: string): string =>
  value.replace(SURFACE_MARKS, "").replace(/[ \t]+/g, " ").trim();

export const cleanLexicalText = (value: string): string =>
  value
    .replace(L_REF, "$1")
    .replace(BRACE_REF, "")
    .replace(SDBG, "")
    .replace(UNDERSCORE_HEADING, "")
    .replace(BARE_UNDERSCORES, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
