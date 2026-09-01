import { describe, expect, it } from "vitest";
import * as layoutPresetModule from "../src/layout-presets";
import {
  captureLayoutPreset,
  clearFollowObsidianFontOverrides,
  findCssClassLayoutRule,
  getEditedLayoutPresetId,
  getLayoutPresetValues,
  hasLayoutPresetOverrides,
  normalizeCssClassLayoutRules,
  normalizeLayoutPresetId,
  normalizeLayoutPresetOverrides,
  normalizeLayoutPresetValues,
  resolveLayoutPresetToRestore,
} from "../src/layout-presets";
import {
  DEFAULT_SETTINGS,
  type ChineseWritingSettings,
  type CustomLayoutPreset,
  type DocumentLayoutSettings,
} from "../src/types";

type ApplySavedLayoutPresetSnapshot = (
  settings: ChineseWritingSettings,
  preset: CustomLayoutPreset,
  documentLayout?: DocumentLayoutSettings,
) => void;

function getApplySavedLayoutPresetSnapshot(): ApplySavedLayoutPresetSnapshot | undefined {
  return (layoutPresetModule as unknown as {
    applySavedLayoutPresetSnapshot?: ApplySavedLayoutPresetSnapshot;
  }).applySavedLayoutPresetSnapshot;
}

describe("layout presets", () => {
  it("captures only visual layout settings", () => {
    expect(DEFAULT_SETTINGS.fontFamily.startsWith('"思源宋体"')).toBe(true);
    expect(DEFAULT_SETTINGS.headingFontFamily.startsWith('"思源黑体"')).toBe(true);

    const settings: ChineseWritingSettings = {
      ...DEFAULT_SETTINGS,
      fontSize: 21,
      lineHeight: 2.2,
      letterSpacing: 0.2,
      leftMargin: 1.5,
      rightMargin: 2.5,
      paperTheme: "rose",
      showDiagnostics: false,
      typewriterMode: true,
    };

    expect(captureLayoutPreset(settings)).toEqual({
      bodyFont: DEFAULT_SETTINGS.bodyFont,
      headingFont: DEFAULT_SETTINGS.headingFont,
      quoteFont: DEFAULT_SETTINGS.quoteFont,
      boldFont: DEFAULT_SETTINGS.boldFont,
      italicFont: DEFAULT_SETTINGS.italicFont,
      fontFamily: DEFAULT_SETTINGS.fontFamily,
      headingFontFamily: DEFAULT_SETTINGS.headingFontFamily,
      quoteFontFamily: DEFAULT_SETTINGS.quoteFontFamily,
      boldFontFamily: DEFAULT_SETTINGS.boldFontFamily,
      italicFontFamily: DEFAULT_SETTINGS.italicFontFamily,
      fontSize: 21,
      lineHeight: 2.2,
      letterSpacing: 0.2,
      paragraphSpacing: DEFAULT_SETTINGS.paragraphSpacing,
      firstLineIndent: DEFAULT_SETTINGS.firstLineIndent,
      contentWidth: DEFAULT_SETTINGS.contentWidth,
      leftMargin: 1.5,
      rightMargin: 2.5,
      paperTheme: "rose",
      customPaperImage: "",
      justifyText: true,
    });
  });

  it("captures the structured font roles alongside legacy CSS fields", () => {
    const captured = captureLayoutPreset(DEFAULT_SETTINGS);

    expect(captured.bodyFont).toEqual({ source: "system", id: "思源宋体" });
    expect(captured.headingFont).toEqual({ source: "system", id: "思源黑体" });
    expect(captured.quoteFont).toEqual({ source: "inherit", id: "body" });
    expect(captured.boldFont).toEqual({ source: "inherit", id: "body" });
    expect(captured.italicFont).toEqual({ source: "inherit", id: "body" });
    expect(captured.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
  });

  it("migrates legacy layout font strings into all five structured roles", () => {
    const values = normalizeLayoutPresetValues({
      fontFamily: '"霞鹜文楷", "思源宋体", serif',
      headingFontFamily: '"思源黑体", sans-serif',
      specialFontFamily: '"引用字体", serif',
    });

    expect(values.bodyFont).toEqual({ source: "system", id: "霞鹜文楷" });
    expect(values.headingFont).toEqual({ source: "system", id: "思源黑体" });
    expect(values.quoteFont).toEqual({ source: "system", id: "引用字体" });
    expect(values.boldFont).toEqual({ source: "system", id: "引用字体" });
    expect(values.italicFont).toEqual({ source: "system", id: "引用字体" });
  });

  it("keeps a legacy layout with no heading font following its body font", () => {
    const values = normalizeLayoutPresetValues({
      fontFamily: '"正文", serif',
    });

    expect(values.headingFont).toEqual({ source: "system", id: "正文" });
    expect(values.headingFontFamily).toBe(values.fontFamily);
  });

  it("keeps structured font selections usable by the legacy CSS consumers", () => {
    const values = normalizeLayoutPresetValues({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "builtin", id: "source-han-sans" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "system", id: "黑体" },
      italicFont: { source: "obsidian", id: "text" },
    });

    expect(values.bodyFont).toEqual({ source: "user", id: "font-a" });
    expect(values.headingFont).toEqual({ source: "builtin", id: "source-han-sans" });
    expect(values.quoteFont).toEqual({ source: "inherit", id: "body" });
    expect(values.boldFont).toEqual({ source: "system", id: "黑体" });
    expect(values.italicFont).toEqual({ source: "obsidian", id: "text" });
    expect(values.fontFamily).toBe('"font-a", serif');
    expect(values.headingFontFamily).toBe('"source-han-sans", sans-serif');
    expect(values.quoteFontFamily).toBe(values.fontFamily);
    expect(values.boldFontFamily).toBe('"黑体", serif');
    expect(values.italicFontFamily).toBe("inherit");
  });

  it("normalizes imported values and rejects missing saved templates", () => {
    const values = normalizeLayoutPresetValues({
      fontSize: 99,
      lineHeight: 1.86,
      letterSpacing: 4.26,
      firstLineIndent: -2,
      paperTheme: "invalid" as never,
      customPaperImage: "背景/纸张.png",
      justifyText: false,
    });

    expect(values.fontSize).toBe(28);
    expect(values.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(values.headingFontFamily).toBe(values.fontFamily);
    expect(values.quoteFontFamily).toBe(values.fontFamily);
    expect(values.boldFontFamily).toBe(values.fontFamily);
    expect(values.italicFontFamily).toBe(values.fontFamily);
    expect(values.lineHeight).toBe(1.9);
    expect(values.letterSpacing).toBe(4);
    expect(values.firstLineIndent).toBe(0);
    expect(values.leftMargin).toBe(0);
    expect(values.rightMargin).toBe(0);
    expect(values.paperTheme).toBe("warm");
    expect(values.customPaperImage).toBe("背景/纸张.png");
    expect(values.justifyText).toBe(false);
    expect(normalizeLayoutPresetId("saved:missing", [])).toBe("custom");
    expect(normalizeLayoutPresetId("saved:mine", [{
      id: "mine",
      name: "我的模板",
      values,
    }])).toBe("saved:mine");
  });

  it("repairs historical Obsidian question-mark font placeholders in saved values", () => {
    const values = normalizeLayoutPresetValues({
      fontFamily: "'??'",
      headingFontFamily: "'??'",
      quoteFontFamily: "'??'",
      boldFontFamily: "'??'",
      italicFontFamily: "'??'",
    });

    expect(values.fontFamily).toBe("inherit");
    expect(values.headingFontFamily).toBe("inherit");
    expect(values.quoteFontFamily).toBe("inherit");
    expect(values.boldFontFamily).toBe("inherit");
    expect(values.italicFontFamily).toBe("inherit");
  });

  it("drops historical Obsidian font placeholders from Follow Obsidian overrides", () => {
    expect(normalizeLayoutPresetOverrides({
      fontFamily: "'??'",
      headingFontFamily: "'??'",
    })).toEqual({});
  });

  it("does not turn dynamic Obsidian font values into explicit overrides", () => {
    expect(normalizeLayoutPresetOverrides({
      fontFamily: "inherit",
      headingFontFamily: "var(--font-editor), sans-serif",
    })).toEqual({});
  });

  it("normalizes independent left and right margins while keeping old templates compatible", () => {
    const oldTemplate = normalizeLayoutPresetValues({ contentWidth: 48 });
    expect(oldTemplate.leftMargin).toBe(0);
    expect(oldTemplate.rightMargin).toBe(0);

    const values = normalizeLayoutPresetValues({
      leftMargin: 3.26,
      rightMargin: 99,
    });
    expect(values.leftMargin).toBe(3.5);
    expect(values.rightMargin).toBe(12);
  });

  it("preserves an exact measured content width in a saved layout snapshot", () => {
    const values = normalizeLayoutPresetValues({
      contentWidth: 41,
      contentWidthPx: 704.5,
    });

    expect(values.contentWidth).toBe(41);
    expect(values.contentWidthPx).toBe(704.5);
  });

  it("turns edited saved-template values into an explicit custom layout", () => {
    expect(getEditedLayoutPresetId("saved:mine")).toBe("custom");
    expect(getEditedLayoutPresetId("obsidian")).toBe("obsidian");
    expect(getEditedLayoutPresetId("default")).toBe("custom");
    expect(getEditedLayoutPresetId("custom")).toBe("custom");
  });

  it("restores the previously selected template after editing becomes custom", () => {
    const values = normalizeLayoutPresetValues({ fontSize: 22 });
    const presets: CustomLayoutPreset[] = [{
      id: "mine",
      name: "我的模板",
      values,
    }];

    expect(resolveLayoutPresetToRestore("custom", "saved:mine", presets)).toBe("saved:mine");
    expect(resolveLayoutPresetToRestore("custom", "default", presets)).toBe("default");
    expect(resolveLayoutPresetToRestore("custom", undefined, presets)).toBeNull();
    expect(resolveLayoutPresetToRestore("custom", "saved:missing", presets)).toBeNull();
    expect(resolveLayoutPresetToRestore("saved:mine", undefined, presets)).toBe("saved:mine");
  });

  it("keeps only explicitly changed values for Follow Obsidian overrides", () => {
    const overrides = normalizeLayoutPresetOverrides({
      fontSize: 99,
      lineHeight: 1.86,
      letterSpacing: 0.34,
      headingFontFamily: '"标题字体", sans-serif',
      leftMargin: 1.5,
      rightMargin: 2,
      justifyText: false,
    });

    expect(overrides).toEqual({
      fontSize: 28,
      lineHeight: 1.9,
      letterSpacing: 0.3,
      headingFontFamily: '"标题字体", sans-serif',
      leftMargin: 1.5,
      rightMargin: 2,
      justifyText: false,
    });
    expect(overrides.fontFamily).toBeUndefined();
    expect(overrides.paperTheme).toBeUndefined();
    expect(hasLayoutPresetOverrides(overrides)).toBe(true);
    expect(hasLayoutPresetOverrides({})).toBe(false);
    expect(hasLayoutPresetOverrides(undefined)).toBe(false);
  });

  it("normalizes structured Follow Obsidian overrides without making inherit explicit", () => {
    const overrides = normalizeLayoutPresetOverrides({
      bodyFont: { source: "obsidian", id: "text" },
      headingFont: { source: "user", id: "font-a" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "system", id: "黑体" },
    });

    expect(overrides.bodyFont).toBeUndefined();
    expect(overrides.fontFamily).toBeUndefined();
    expect(overrides.headingFont).toEqual({ source: "user", id: "font-a" });
    expect(overrides.headingFontFamily).toBe('"font-a", sans-serif');
    expect(overrides.quoteFont).toBeUndefined();
    expect(overrides.quoteFontFamily).toBeUndefined();
    expect(overrides.boldFont).toEqual({ source: "system", id: "黑体" });
    expect(overrides.boldFontFamily).toBe('"黑体", serif');
  });

  it("clears explicit font overrides when a selection returns to Obsidian inheritance", () => {
    const overrides = normalizeLayoutPresetOverrides({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "system", id: "标题字体" },
      quoteFont: { source: "system", id: "引用字体" },
      fontSize: 20,
    });

    clearFollowObsidianFontOverrides(overrides, {
      bodyFont: { source: "obsidian", id: "text" },
      quoteFont: { source: "inherit", id: "body" },
    });

    expect(overrides.bodyFont).toBeUndefined();
    expect(overrides.fontFamily).toBeUndefined();
    expect(overrides.quoteFont).toBeUndefined();
    expect(overrides.quoteFontFamily).toBeUndefined();
    expect(overrides.headingFont).toEqual({ source: "system", id: "标题字体" });
    expect(overrides.headingFontFamily).toBe('"标题字体", sans-serif');
    expect(overrides.fontSize).toBe(20);
  });

  it("migrates the former special-format font into separate roles", () => {
    const values = normalizeLayoutPresetValues({
      fontFamily: '"正文字体", serif',
      specialFontFamily: '"旧特殊字体", serif',
    });

    expect(values.quoteFontFamily).toBe('"旧特殊字体", serif');
    expect(values.boldFontFamily).toBe('"旧特殊字体", serif');
    expect(values.italicFontFamily).toBe('"旧特殊字体", serif');
  });

  it("normalizes CSS class template rules and removes duplicate classes", () => {
    const values = normalizeLayoutPresetValues({ fontSize: 20 });
    const presets = [{ id: "scene", name: "场景模板", values }];
    const rules = normalizeCssClassLayoutRules([
      { id: "a", cssClass: ".scene-romance", layoutPreset: "saved:scene" },
      { id: "b", cssClass: "scene-romance", layoutPreset: "default" },
      { id: "c", cssClass: "battle", layoutPreset: "saved:missing" },
      { id: "d", cssClass: "", layoutPreset: "default" },
    ], presets);

    expect(rules).toEqual([
      { id: "a", cssClass: "scene-romance", layoutPreset: "saved:scene" },
      { id: "c", cssClass: "battle", layoutPreset: "default" },
    ]);
  });

  it("matches the first CSS class rule in rule order", () => {
    const rules = [
      { id: "first", cssClass: "scene", layoutPreset: "default" as const },
      { id: "second", cssClass: "chapter", layoutPreset: "default" as const },
    ];
    expect(findCssClassLayoutRule(["chapter", "scene"], rules)?.id).toBe("first");
    expect(findCssClassLayoutRule(["note"], rules)).toBeNull();
  });

  it("resolves default and saved template values for class rules", () => {
    const saved = normalizeLayoutPresetValues({ fontSize: 24, paperTheme: "rose" });
    const presets = [{ id: "scene", name: "场景模板", values: saved }];
    expect(getLayoutPresetValues("saved:scene", presets)?.fontSize).toBe(24);
    expect(getLayoutPresetValues("default", presets)?.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(getLayoutPresetValues("saved:missing", presets)).toBeNull();
  });

  it("keeps a Follow Obsidian snapshot active after saving it as a global template", () => {
    const applySavedLayoutPresetSnapshot = getApplySavedLayoutPresetSnapshot();
    expect(applySavedLayoutPresetSnapshot).toBeTypeOf("function");

    const settings: ChineseWritingSettings = {
      ...DEFAULT_SETTINGS,
      layoutPreset: "obsidian",
      fontFamily: DEFAULT_SETTINGS.fontFamily,
      paperTheme: "warm",
    };
    const values = normalizeLayoutPresetValues({
      ...captureLayoutPreset(DEFAULT_SETTINGS),
      fontFamily: '"Obsidian 默认字体", sans-serif',
      headingFontFamily: '"Obsidian 默认字体", sans-serif',
      quoteFontFamily: '"Obsidian 默认字体", sans-serif',
      boldFontFamily: '"Obsidian 默认字体", sans-serif',
      italicFontFamily: '"Obsidian 默认字体", sans-serif',
      fontSize: 17,
      paperTheme: "plain",
    });
    const preset: CustomLayoutPreset = {
      id: "obsidian-copy",
      name: "Obsidian 微调",
      values,
    };

    applySavedLayoutPresetSnapshot!(settings, preset);

    expect(settings.layoutPreset).toBe("saved:obsidian-copy");
    expect(settings.fontFamily).toBe('"Obsidian 默认字体", sans-serif');
    expect(settings.fontSize).toBe(17);
    expect(settings.paperTheme).toBe("plain");
  });

  it("copies the saved snapshot into a document layout without sharing mutable values", () => {
    const applySavedLayoutPresetSnapshot = getApplySavedLayoutPresetSnapshot();
    expect(applySavedLayoutPresetSnapshot).toBeTypeOf("function");

    const settings: ChineseWritingSettings = { ...DEFAULT_SETTINGS };
    const values = normalizeLayoutPresetValues({
      ...captureLayoutPreset(DEFAULT_SETTINGS),
      fontFamily: '"Obsidian 默认字体", sans-serif',
      paperTheme: "plain",
    });
    const preset: CustomLayoutPreset = {
      id: "document-copy",
      name: "单篇 Obsidian 微调",
      values,
    };
    const documentLayout: DocumentLayoutSettings = {
      layoutPreset: "obsidian",
      values: normalizeLayoutPresetValues(captureLayoutPreset(DEFAULT_SETTINGS)),
      obsidianOverrides: { fontSize: 20 },
    };

    applySavedLayoutPresetSnapshot!(settings, preset, documentLayout);

    expect(documentLayout.layoutPreset).toBe("saved:document-copy");
    expect(documentLayout.values).toEqual(values);
    expect(documentLayout.values).not.toBe(preset.values);
    documentLayout.values.fontSize = 24;
    expect(preset.values.fontSize).not.toBe(24);
    expect(settings.layoutPreset).toBe(DEFAULT_SETTINGS.layoutPreset);
  });
});
