const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

export function extractFontFamilyNames(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((item) => item.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter((item) => item && !GENERIC_FAMILIES.has(item.toLowerCase()));
}

export function getPrimaryFontName(fontFamily: string): string {
  return extractFontFamilyNames(fontFamily)[0] ?? "跟随正文";
}

export function fontNameToCssFamily(fontName: string): string {
  const escaped = fontName.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return escaped ? `"${escaped}"` : "serif";
}
