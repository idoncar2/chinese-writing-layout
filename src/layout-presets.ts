import {
  DEFAULT_SETTINGS,
  normalizePaperTheme,
  type ChineseWritingSettings,
  type CssClassLayoutRule,
  type CustomLayoutPreset,
  type LayoutPresetId,
  type LayoutPresetOverrides,
  type LayoutPresetValues,
} from "./types";

function normalizeNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(maximum, Math.max(minimum, numeric));
  return Number((Math.round(clamped / step) * step).toFixed(2));
}

export function captureLayoutPreset(
  settings: ChineseWritingSettings,
): LayoutPresetValues {
  return {
    fontFamily: settings.fontFamily,
    headingFontFamily: settings.headingFontFamily,
    quoteFontFamily: settings.quoteFontFamily,
    boldFontFamily: settings.boldFontFamily,
    italicFontFamily: settings.italicFontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    paragraphSpacing: settings.paragraphSpacing,
    firstLineIndent: settings.firstLineIndent,
    contentWidth: settings.contentWidth,
    paperTheme: settings.paperTheme,
    customPaperImage: settings.customPaperImage,
    justifyText: settings.justifyText,
  };
}

export function normalizeLayoutPresetValues(
  values: (Partial<LayoutPresetValues> & { specialFontFamily?: string }) | null | undefined,
): LayoutPresetValues {
  const fontFamily = typeof values?.fontFamily === "string" && values.fontFamily.trim()
    ? values.fontFamily.trim()
    : DEFAULT_SETTINGS.fontFamily;
  return {
    fontFamily,
    headingFontFamily:
      typeof values?.headingFontFamily === "string" && values.headingFontFamily.trim()
        ? values.headingFontFamily.trim()
        : fontFamily,
    quoteFontFamily: normalizeSpecialFormatFont(
      values?.quoteFontFamily,
      values?.specialFontFamily,
      fontFamily,
    ),
    boldFontFamily: normalizeSpecialFormatFont(
      values?.boldFontFamily,
      values?.specialFontFamily,
      fontFamily,
    ),
    italicFontFamily: normalizeSpecialFormatFont(
      values?.italicFontFamily,
      values?.specialFontFamily,
      fontFamily,
    ),
    fontSize: normalizeNumber(values?.fontSize, DEFAULT_SETTINGS.fontSize, 14, 28, 1),
    lineHeight: normalizeNumber(values?.lineHeight, DEFAULT_SETTINGS.lineHeight, 1.4, 2.6, 0.1),
    paragraphSpacing: normalizeNumber(
      values?.paragraphSpacing,
      DEFAULT_SETTINGS.paragraphSpacing,
      0,
      2,
      0.1,
    ),
    firstLineIndent: normalizeNumber(
      values?.firstLineIndent,
      DEFAULT_SETTINGS.firstLineIndent,
      0,
      4,
      0.5,
    ),
    contentWidth: normalizeNumber(values?.contentWidth, DEFAULT_SETTINGS.contentWidth, 28, 72, 1),
    paperTheme: normalizePaperTheme(values?.paperTheme),
    customPaperImage: typeof values?.customPaperImage === "string"
      ? values.customPaperImage
      : DEFAULT_SETTINGS.customPaperImage,
    justifyText: typeof values?.justifyText === "boolean"
      ? values.justifyText
      : DEFAULT_SETTINGS.justifyText,
  };
}

/**
 * 只保留用户明确设置过的字段。它不能调用完整版式的默认值逻辑，
 * 否则“跟随 Obsidian”会被一整套插件默认值重新覆盖。
 */
export function normalizeLayoutPresetOverrides(
  values: Partial<LayoutPresetValues> | null | undefined,
): LayoutPresetOverrides {
  if (!values) return {};
  const normalized: LayoutPresetOverrides = {};
  if (typeof values.fontFamily === "string" && values.fontFamily.trim()) {
    normalized.fontFamily = values.fontFamily.trim();
  }
  if (typeof values.headingFontFamily === "string" && values.headingFontFamily.trim()) {
    normalized.headingFontFamily = values.headingFontFamily.trim();
  }
  for (const key of ["quoteFontFamily", "boldFontFamily", "italicFontFamily"] as const) {
    if (typeof values[key] === "string" && values[key].trim()) {
      normalized[key] = values[key].trim();
    }
  }
  if (typeof values.fontSize === "number") {
    normalized.fontSize = normalizeNumber(values.fontSize, DEFAULT_SETTINGS.fontSize, 14, 28, 1);
  }
  if (typeof values.lineHeight === "number") {
    normalized.lineHeight = normalizeNumber(values.lineHeight, DEFAULT_SETTINGS.lineHeight, 1.4, 2.6, 0.1);
  }
  if (typeof values.paragraphSpacing === "number") {
    normalized.paragraphSpacing = normalizeNumber(values.paragraphSpacing, DEFAULT_SETTINGS.paragraphSpacing, 0, 2, 0.1);
  }
  if (typeof values.firstLineIndent === "number") {
    normalized.firstLineIndent = normalizeNumber(values.firstLineIndent, DEFAULT_SETTINGS.firstLineIndent, 0, 4, 0.5);
  }
  if (typeof values.contentWidth === "number") {
    normalized.contentWidth = normalizeNumber(values.contentWidth, DEFAULT_SETTINGS.contentWidth, 28, 72, 1);
  }
  if (values.paperTheme !== undefined) normalized.paperTheme = normalizePaperTheme(values.paperTheme);
  if (typeof values.customPaperImage === "string") normalized.customPaperImage = values.customPaperImage;
  if (typeof values.justifyText === "boolean") normalized.justifyText = values.justifyText;
  return normalized;
}

function normalizeSpecialFormatFont(
  value: unknown,
  legacyValue: unknown,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof legacyValue === "string" && legacyValue.trim()) return legacyValue.trim();
  return fallback;
}

export function normalizeLayoutPresetId(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): LayoutPresetId {
  if (value === "default" || value === "custom" || value === "obsidian") return value;
  if (
    typeof value === "string"
    && value.startsWith("saved:")
    && presets.some((preset) => preset.id === value.slice("saved:".length))
  ) return value as LayoutPresetId;
  return "custom";
}

/**
 * 推荐版式被修改后会成为未命名的自定义设置；跟随 Obsidian 继续记录字段覆盖；
 * 已保存模板则保持选中，等待用户明确执行“保存修改”后才覆盖模板快照。
 */
export function getEditedLayoutPresetId(presetId: LayoutPresetId): LayoutPresetId {
  if (presetId === "obsidian" || presetId.startsWith("saved:")) return presetId;
  return "custom";
}

export function hasLayoutPresetOverrides(
  overrides: LayoutPresetOverrides | undefined,
): boolean {
  return Boolean(overrides && Object.keys(overrides).length > 0);
}

export function normalizeCssClassName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\.+/, "").split(/\s+/u)[0] ?? "";
}

export function normalizeCssClassLayoutRules(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): CssClassLayoutRule[] {
  if (!Array.isArray(value)) return [];
  const seenClasses = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<CssClassLayoutRule>;
    const cssClass = normalizeCssClassName(raw.cssClass);
    if (!cssClass || seenClasses.has(cssClass)) return [];
    seenClasses.add(cssClass);
    const normalizedPreset = normalizeLayoutPresetId(raw.layoutPreset, presets);
    const layoutPreset = normalizedPreset === "custom" ? "default" : normalizedPreset;
    return [{
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `rule-${index + 1}`,
      cssClass,
      layoutPreset,
    }];
  });
}

export function findCssClassLayoutRule(
  classes: readonly string[],
  rules: readonly CssClassLayoutRule[],
): CssClassLayoutRule | null {
  const available = new Set(classes);
  return rules.find((rule) => available.has(rule.cssClass)) ?? null;
}

export function getLayoutPresetValues(
  presetId: LayoutPresetId,
  presets: readonly CustomLayoutPreset[],
): LayoutPresetValues | null {
  if (presetId === "default") {
    return normalizeLayoutPresetValues(captureLayoutPreset(DEFAULT_SETTINGS));
  }
  if (!presetId.startsWith("saved:")) return null;
  const preset = presets.find((item) => item.id === presetId.slice("saved:".length));
  return preset ? normalizeLayoutPresetValues(preset.values) : null;
}
