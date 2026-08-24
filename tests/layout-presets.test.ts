import { describe, expect, it } from "vitest";
import {
  captureLayoutPreset,
  findCssClassLayoutRule,
  getEditedLayoutPresetId,
  getLayoutPresetValues,
  hasLayoutPresetOverrides,
  normalizeCssClassLayoutRules,
  normalizeLayoutPresetId,
  normalizeLayoutPresetOverrides,
  normalizeLayoutPresetValues,
} from "../src/layout-presets";
import { DEFAULT_SETTINGS, type ChineseWritingSettings } from "../src/types";

describe("layout presets", () => {
  it("captures only visual layout settings", () => {
    expect(DEFAULT_SETTINGS.fontFamily.startsWith('"思源宋体"')).toBe(true);
    expect(DEFAULT_SETTINGS.headingFontFamily.startsWith('"思源黑体"')).toBe(true);

    const settings: ChineseWritingSettings = {
      ...DEFAULT_SETTINGS,
      fontSize: 21,
      lineHeight: 2.2,
      paperTheme: "rose",
      showDiagnostics: false,
      typewriterMode: true,
    };

    expect(captureLayoutPreset(settings)).toEqual({
      fontFamily: DEFAULT_SETTINGS.fontFamily,
      headingFontFamily: DEFAULT_SETTINGS.headingFontFamily,
      quoteFontFamily: DEFAULT_SETTINGS.quoteFontFamily,
      boldFontFamily: DEFAULT_SETTINGS.boldFontFamily,
      italicFontFamily: DEFAULT_SETTINGS.italicFontFamily,
      fontSize: 21,
      lineHeight: 2.2,
      paragraphSpacing: DEFAULT_SETTINGS.paragraphSpacing,
      firstLineIndent: DEFAULT_SETTINGS.firstLineIndent,
      contentWidth: DEFAULT_SETTINGS.contentWidth,
      paperTheme: "rose",
      customPaperImage: "",
      justifyText: true,
    });
  });

  it("normalizes imported values and rejects missing saved templates", () => {
    const values = normalizeLayoutPresetValues({
      fontSize: 99,
      lineHeight: 1.86,
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
    expect(values.firstLineIndent).toBe(0);
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

  it("keeps a saved template selected while its working values are edited", () => {
    expect(getEditedLayoutPresetId("saved:mine")).toBe("saved:mine");
    expect(getEditedLayoutPresetId("obsidian")).toBe("obsidian");
    expect(getEditedLayoutPresetId("default")).toBe("custom");
    expect(getEditedLayoutPresetId("custom")).toBe("custom");
  });

  it("keeps only explicitly changed values for Follow Obsidian overrides", () => {
    const overrides = normalizeLayoutPresetOverrides({
      fontSize: 99,
      lineHeight: 1.86,
      headingFontFamily: '"标题字体", sans-serif',
      justifyText: false,
    });

    expect(overrides).toEqual({
      fontSize: 28,
      lineHeight: 1.9,
      headingFontFamily: '"标题字体", sans-serif',
      justifyText: false,
    });
    expect(overrides.fontFamily).toBeUndefined();
    expect(overrides.paperTheme).toBeUndefined();
    expect(hasLayoutPresetOverrides(overrides)).toBe(true);
    expect(hasLayoutPresetOverrides({})).toBe(false);
    expect(hasLayoutPresetOverrides(undefined)).toBe(false);
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
});
