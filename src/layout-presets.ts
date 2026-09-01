import {
  DEFAULT_SETTINGS,
  normalizePaperTheme,
  type ChineseWritingSettings,
  type CssClassLayoutRule,
  type CustomLayoutPreset,
  type DocumentLayoutSettings,
  type LayoutPresetId,
  type LayoutPresetOverrides,
  type LayoutPresetValues,
} from "./types";
import {
  isObsidianFontPlaceholder,
  normalizeObsidianFontFamily,
  OBSIDIAN_NATIVE_FONT_FAMILY,
} from "./obsidian-baseline";
import {
  fontSelectionToLegacyFontFamily,
  isFontSelection,
  normalizeFontSelection,
  normalizeFontSelections,
  type FontRole,
} from "./font-selection";

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
  const values: LayoutPresetValues = {
    bodyFont: { ...settings.bodyFont },
    headingFont: { ...settings.headingFont },
    quoteFont: { ...settings.quoteFont },
    boldFont: { ...settings.boldFont },
    italicFont: { ...settings.italicFont },
    fontFamily: settings.fontFamily,
    headingFontFamily: settings.headingFontFamily,
    quoteFontFamily: settings.quoteFontFamily,
    boldFontFamily: settings.boldFontFamily,
    italicFontFamily: settings.italicFontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    paragraphSpacing: settings.paragraphSpacing,
    firstLineIndent: settings.firstLineIndent,
    contentWidth: settings.contentWidth,
    leftMargin: settings.leftMargin,
    rightMargin: settings.rightMargin,
    paperTheme: settings.paperTheme,
    customPaperImage: settings.customPaperImage,
    justifyText: settings.justifyText,
  };
  if (settings.contentWidthPx !== undefined) values.contentWidthPx = settings.contentWidthPx;
  return values;
}

export function normalizeLayoutPresetValues(
  values: (Partial<LayoutPresetValues> & { specialFontFamily?: unknown }) | null | undefined,
): LayoutPresetValues {
  const fontSelections = normalizeFontSelections(values, { missingHeading: "body" });
  const hasBodyLegacy = hasFontFamilyValue(values?.fontFamily);
  const fontFamily = hasBodyLegacy
    ? normalizeObsidianFontFamily(values?.fontFamily, DEFAULT_SETTINGS.fontFamily)
    : values?.bodyFont !== undefined
      ? fontSelectionToLegacyFontFamily(fontSelections.bodyFont, "body")
      : DEFAULT_SETTINGS.fontFamily;
  const contentWidthPx = normalizeContentWidthPx(values?.contentWidthPx);
  const hasHeadingLegacy = hasFontFamilyValue(values?.headingFontFamily);
  const headingFontFamily = hasHeadingLegacy
    ? normalizeObsidianFontFamily(values?.headingFontFamily, fontFamily)
    : values?.headingFont !== undefined
      ? fontSelectionToLegacyFontFamily(fontSelections.headingFont, "heading")
      : hasBodyLegacy
        ? fontFamily
        : DEFAULT_SETTINGS.fontFamily;
  return {
    ...fontSelections,
    fontFamily,
    headingFontFamily,
    quoteFontFamily: normalizeSpecialFormatFont(values, "quote", fontFamily, fontSelections.quoteFont),
    boldFontFamily: normalizeSpecialFormatFont(values, "bold", fontFamily, fontSelections.boldFont),
    italicFontFamily: normalizeSpecialFormatFont(values, "italic", fontFamily, fontSelections.italicFont),
    fontSize: normalizeNumber(values?.fontSize, DEFAULT_SETTINGS.fontSize, 14, 28, 1),
    lineHeight: normalizeNumber(values?.lineHeight, DEFAULT_SETTINGS.lineHeight, 1.4, 2.6, 0.1),
    letterSpacing: normalizeNumber(
      values?.letterSpacing,
      DEFAULT_SETTINGS.letterSpacing,
      -1,
      4,
      0.1,
    ),
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
    ...(contentWidthPx === undefined ? {} : { contentWidthPx }),
    leftMargin: normalizeNumber(values?.leftMargin, DEFAULT_SETTINGS.leftMargin, 0, 12, 0.5),
    rightMargin: normalizeNumber(values?.rightMargin, DEFAULT_SETTINGS.rightMargin, 0, 12, 0.5),
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
 * 保存模板后立即让当前作用域使用同一份完整快照。
 * 这一步不能只切换 layoutPreset，否则全局作用域会重新暴露旧的插件默认字段。
 */
export function applySavedLayoutPresetSnapshot(
  settings: ChineseWritingSettings,
  preset: CustomLayoutPreset,
  documentLayout?: DocumentLayoutSettings,
): void {
  const values = normalizeLayoutPresetValues(preset.values);
  const presetId = `saved:${preset.id}` as LayoutPresetId;
  if (documentLayout) {
    documentLayout.values = { ...values };
    documentLayout.layoutPreset = presetId;
    delete documentLayout.lastSelectedLayoutPreset;
    return;
  }
  Object.assign(settings, values);
  if (values.contentWidthPx === undefined) delete settings.contentWidthPx;
  settings.layoutPreset = presetId;
  delete settings.lastSelectedLayoutPreset;
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
  const structuredFontRoles = [
    ["bodyFont", "fontFamily", "body"],
    ["headingFont", "headingFontFamily", "heading"],
    ["quoteFont", "quoteFontFamily", "quote"],
    ["boldFont", "boldFontFamily", "bold"],
    ["italicFont", "italicFontFamily", "italic"],
  ] as const;
  for (const [selectionKey, legacyKey, role] of structuredFontRoles) {
    if (values[selectionKey] !== undefined && isFontSelection(values[selectionKey])) {
      const selection = normalizeFontSelection(values[selectionKey], role);
      if (selection.source !== "obsidian" && selection.source !== "inherit") {
        normalized[selectionKey] = selection;
        normalized[legacyKey] = fontSelectionToLegacyFontFamily(selection, role);
      }
      continue;
    }
    const legacyValue = getExplicitLayoutFontFamily(values[legacyKey]);
    if (legacyValue) normalized[legacyKey] = legacyValue;
  }
  if (typeof values.fontSize === "number") {
    normalized.fontSize = normalizeNumber(values.fontSize, DEFAULT_SETTINGS.fontSize, 14, 28, 1);
  }
  if (typeof values.lineHeight === "number") {
    normalized.lineHeight = normalizeNumber(values.lineHeight, DEFAULT_SETTINGS.lineHeight, 1.4, 2.6, 0.1);
  }
  if (typeof values.letterSpacing === "number") {
    normalized.letterSpacing = normalizeNumber(values.letterSpacing, DEFAULT_SETTINGS.letterSpacing, -1, 4, 0.1);
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
  if (typeof values.leftMargin === "number") {
    normalized.leftMargin = normalizeNumber(values.leftMargin, DEFAULT_SETTINGS.leftMargin, 0, 12, 0.5);
  }
  if (typeof values.rightMargin === "number") {
    normalized.rightMargin = normalizeNumber(values.rightMargin, DEFAULT_SETTINGS.rightMargin, 0, 12, 0.5);
  }
  if (values.paperTheme !== undefined) normalized.paperTheme = normalizePaperTheme(values.paperTheme);
  if (typeof values.customPaperImage === "string") normalized.customPaperImage = values.customPaperImage;
  if (typeof values.justifyText === "boolean") normalized.justifyText = values.justifyText;
  return normalized;
}

/**
 * Removing an explicit font choice must also remove the legacy CSS field that
 * may have been saved alongside it. Otherwise a Follow Obsidian layout keeps
 * applying the previous font even though the picker now shows “默认”.
 */
export function clearFollowObsidianFontOverrides(
  overrides: LayoutPresetOverrides,
  patch: Partial<LayoutPresetValues>,
): void {
  const structuredFontRoles = [
    ["bodyFont", "fontFamily"],
    ["headingFont", "headingFontFamily"],
    ["quoteFont", "quoteFontFamily"],
    ["boldFont", "boldFontFamily"],
    ["italicFont", "italicFontFamily"],
  ] as const;
  for (const [selectionKey, legacyKey] of structuredFontRoles) {
    const selection = patch[selectionKey];
    if (
      isFontSelection(selection)
      && (selection.source === "obsidian" || selection.source === "inherit")
    ) {
      delete overrides[selectionKey];
      delete overrides[legacyKey];
    }
  }
}

function normalizeSpecialFormatFont(
  values: (Partial<LayoutPresetValues> & { specialFontFamily?: unknown }) | null | undefined,
  role: Extract<FontRole, "quote" | "bold" | "italic">,
  fallback: string,
  selection: LayoutPresetValues["quoteFont"],
): string {
  const legacyKey = `${role}FontFamily` as "quoteFontFamily" | "boldFontFamily" | "italicFontFamily";
  const current = normalizeObsidianFontFamily(values?.[legacyKey], "");
  if (current) return current;
  const legacy = normalizeObsidianFontFamily(values?.specialFontFamily, "");
  if (legacy) return legacy;
  if (values?.[`${role}Font`] !== undefined) {
    return selection.source === "inherit"
      ? fallback
      : fontSelectionToLegacyFontFamily(selection, role);
  }
  return fallback;
}

function hasFontFamilyValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeContentWidthPx(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Number(Math.min(10000, value).toFixed(2));
}

function getExplicitLayoutFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (
    !trimmed
    || isObsidianFontPlaceholder(trimmed)
    || normalized === OBSIDIAN_NATIVE_FONT_FAMILY
    || /var\(\s*--font-[^)]+\)/u.test(normalized)
  ) return undefined;
  return trimmed;
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

export function normalizeOptionalLayoutPresetId(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): LayoutPresetId | undefined {
  const normalized = normalizeLayoutPresetId(value, presets);
  return normalized === "custom" ? undefined : normalized;
}

/**
 * Resolve the template that the reset action should restore. A custom layout
 * uses the remembered source template; named templates remain directly
 * restorable. Deleted or malformed saved-template IDs are not actionable.
 */
export function resolveLayoutPresetToRestore(
  currentPresetId: LayoutPresetId,
  lastSelectedPresetId: LayoutPresetId | undefined,
  presets: readonly CustomLayoutPreset[],
): LayoutPresetId | null {
  const candidate = currentPresetId === "custom"
    ? lastSelectedPresetId
    : currentPresetId;
  const normalized = normalizeLayoutPresetId(candidate, presets);
  return normalized === "custom" ? null : normalized;
}

/**
 * 推荐版式或已保存模板被修改后都会成为未命名的自定义设置；
 * 跟随 Obsidian 继续记录字段覆盖。这样模板 ID 始终代表完整快照，
 * 不会与另一份工作值缓存悄悄分叉。
 */
export function getEditedLayoutPresetId(presetId: LayoutPresetId): LayoutPresetId {
  if (presetId === "obsidian") return presetId;
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
