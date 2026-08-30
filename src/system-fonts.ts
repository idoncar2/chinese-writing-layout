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

const SYSTEM_FONT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "-apple-system": "系统默认字体",
  "apple system": "系统默认字体",
  "apple-system": "系统默认字体",
  blinkmacsystemfont: "系统默认字体",
  "system-ui": "系统默认字体",
  simsun: "宋体（SimSun）",
  simhei: "黑体（SimHei）",
  kaiti: "楷体（KaiTi）",
  fangsong: "仿宋（FangSong）",
  "microsoft yahei": "微软雅黑（Microsoft YaHei）",
  "source han serif sc": "思源宋体（Source Han Serif SC）",
  "source han sans sc": "思源黑体（Source Han Sans SC）",
  思源宋体: "优先思源宋体",
  思源黑体: "优先思源黑体",
};

export function getSystemFontDisplayName(fontName: string): string {
  const trimmed = fontName.trim();
  return SYSTEM_FONT_DISPLAY_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

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
