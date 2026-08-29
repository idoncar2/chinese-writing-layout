import { describe, expect, it } from "vitest";
import {
  migrateLegacyFontFamily,
  countUserFontReferences,
  normalizeFontSelections,
  normalizeFontSettings,
  normalizeUserFonts,
  repairFontSelectionsAfterUserFontDeletion,
} from "../src/font-selection";

describe("structured font selections", () => {
  it("treats a fresh installation as current without requesting a migration save", () => {
    const normalized = normalizeFontSettings(null);

    expect(normalized.changed).toBe(false);
    expect(normalized.userFonts).toEqual([]);
    expect(normalized.bodyFont).toEqual({ source: "system", id: "思源宋体" });
    expect(normalized.headingFont).toEqual({ source: "system", id: "思源黑体" });
    expect(normalized.quoteFont).toEqual({ source: "inherit", id: "body" });
  });

  it("keeps the global heading default when legacy global data omits a heading font", () => {
    const normalized = normalizeFontSettings({
      fontFamily: '"自定义正文", serif',
      userFonts: [],
    });

    expect(normalized.bodyFont).toEqual({ source: "system", id: "自定义正文" });
    expect(normalized.headingFont).toEqual({ source: "system", id: "思源黑体" });
  });

  it("migrates the first actual legacy font and treats generic-only stacks as Obsidian", () => {
    expect(migrateLegacyFontFamily('"霞鹜文楷", "思源宋体", serif', "body")).toEqual({
      source: "system",
      id: "霞鹜文楷",
    });
    expect(migrateLegacyFontFamily("serif", "body")).toEqual({
      source: "obsidian",
      id: "text",
    });
    expect(migrateLegacyFontFamily("var(--font-editor), sans-serif", "body")).toEqual({
      source: "obsidian",
      id: "text",
    });
  });

  it("migrates old layout roles while defaulting missing special roles to body inheritance", () => {
    expect(normalizeFontSelections({
      fontFamily: '"正文", serif',
      headingFontFamily: '"标题", sans-serif',
    })).toEqual({
      bodyFont: { source: "system", id: "正文" },
      headingFont: { source: "system", id: "标题" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "inherit", id: "body" },
      italicFont: { source: "inherit", id: "body" },
    });
  });

  it("treats an empty legacy special font as body inheritance", () => {
    expect(normalizeFontSelections({
      fontFamily: '"正文", serif',
      specialFontFamily: "",
    })).toMatchObject({
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "inherit", id: "body" },
      italicFont: { source: "inherit", id: "body" },
    });
  });

  it("preserves valid structured roles and rejects inherit for body and heading", () => {
    expect(normalizeFontSelections({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "obsidian", id: "heading" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "builtin", id: "source-han-serif" },
      italicFont: { source: "system", id: "PingFang SC" },
    })).toEqual({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "obsidian", id: "heading" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "builtin", id: "source-han-serif" },
      italicFont: { source: "system", id: "PingFang SC" },
    });

    const invalidBodyRoles = normalizeFontSelections({
      bodyFont: { source: "inherit", id: "body" },
      headingFont: { source: "inherit", id: "body" },
    });
    expect(invalidBodyRoles.bodyFont).toEqual({ source: "system", id: "思源宋体" });
    expect(invalidBodyRoles.headingFont).toEqual({ source: "system", id: "思源黑体" });
  });

  it("normalizes the new settings payload and marks legacy data for one-time persistence", () => {
    const normalized = normalizeFontSettings({
      settingsSchemaVersion: 1,
      fontFamily: '"霞鹜文楷", serif',
      headingFontFamily: '"思源黑体", sans-serif',
      specialFontFamily: '"引用字体", serif',
      userFonts: [{
        id: "font-a",
        name: "霞鹜文楷",
        fileName: "font-a.woff2",
        originalFileName: "LXGWWenKai.woff2",
        format: "woff2",
      }],
    });

    expect(normalized.changed).toBe(true);
    expect(normalized.bodyFont).toEqual({ source: "system", id: "霞鹜文楷" });
    expect(normalized.headingFont).toEqual({ source: "system", id: "思源黑体" });
    expect(normalized.quoteFont).toEqual({ source: "system", id: "引用字体" });
    expect(normalized.boldFont).toEqual({ source: "system", id: "引用字体" });
    expect(normalized.italicFont).toEqual({ source: "system", id: "引用字体" });
    expect(normalized.userFonts).toHaveLength(1);
  });

  it("does not request another save for a complete current-schema font payload", () => {
    const normalized = normalizeFontSettings({
      settingsSchemaVersion: 2,
      bodyFont: { source: "system", id: "正文" },
      headingFont: { source: "obsidian", id: "heading" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "inherit", id: "body" },
      italicFont: { source: "inherit", id: "body" },
      userFonts: [],
    });

    expect(normalized.changed).toBe(false);
    expect(normalized.settingsSchemaVersion).toBe(2);
  });

  it("filters invalid user font metadata without inspecting the font file", () => {
    expect(normalizeUserFonts([
      {
        id: "font-a",
        name: "有效字体",
        fileName: "font-a.woff2",
        originalFileName: "有效字体.woff2",
        format: "woff2",
      },
      { id: "font-b", name: "", fileName: "font-b.exe", originalFileName: "font-b.exe", format: "exe" },
      { id: "font-a", name: "重复", fileName: "font-c.ttf", originalFileName: "font-c.ttf", format: "ttf" },
    ])).toEqual([{
      id: "font-a",
      name: "有效字体",
      fileName: "font-a.woff2",
      originalFileName: "有效字体.woff2",
      format: "woff2",
    }]);
  });

  it("repairs only active user-font references after an intentional deletion", () => {
    expect(repairFontSelectionsAfterUserFontDeletion({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "user", id: "font-a" },
      quoteFont: { source: "user", id: "font-a" },
      boldFont: { source: "system", id: "黑体" },
      italicFont: { source: "user", id: "font-b" },
    }, "font-a")).toEqual({
      bodyFont: { source: "obsidian", id: "text" },
      headingFont: { source: "obsidian", id: "heading" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "system", id: "黑体" },
      italicFont: { source: "user", id: "font-b" },
    });
  });

  it("counts only the precise user-font positions that reference an id", () => {
    expect(countUserFontReferences({
      bodyFont: { source: "user", id: "font-a" },
      headingFont: { source: "system", id: "标题" },
      quoteFont: { source: "user", id: "font-a" },
      boldFont: { source: "user", id: "font-b" },
    }, "font-a")).toBe(2);
  });
});
