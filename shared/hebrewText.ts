/** Join Delitzsch prefix markers so ב/רצון displays as ברצון. */
export const joinHebrewPrefixSlashes = (value: string): string =>
  value.replace(/\//g, "");
