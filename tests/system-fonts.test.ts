import { describe, expect, it } from "vitest";
import {
  createFontFamilyStack,
  extractFontFamilyNames,
  extractGenericFontFamily,
  extractWindowsFontFamilies,
  fontNameToCssFamily,
  getFontStackSummary,
  getPrimaryFontName,
} from "../src/system-fonts";

describe("system font helpers", () => {
  it("extracts readable names from CSS font stacks", () => {
    const stack = '"霞鹜文楷", "Microsoft YaHei", sans-serif';
    expect(extractFontFamilyNames(stack)).toEqual(["霞鹜文楷", "Microsoft YaHei"]);
    expect(getPrimaryFontName(stack)).toBe("霞鹜文楷");
    expect(getFontStackSummary(stack)).toBe("霞鹜文楷 +1");
    expect(extractGenericFontFamily(stack)).toBe("sans-serif");
  });

  it("quotes selected Windows font names safely", () => {
    expect(fontNameToCssFamily('Writer "Book"')).toBe('"Writer \\"Book\\""');
    expect(createFontFamilyStack(
      ["思源宋体", "Source Han Serif SC", "思源宋体"],
      "serif",
    )).toBe('"思源宋体", "Source Han Serif SC", serif');
  });

  it("normalizes Windows registry font entries", () => {
    expect(new Set(extractWindowsFontFamilies([
      { name: "Arial (TrueType)" },
      { name: "微软雅黑 & Microsoft YaHei UI (TrueType)" },
      { name: "@Vertical Font (TrueType)" },
      { name: "Arial (TrueType)" },
    ]))).toEqual(new Set(["Arial", "Microsoft YaHei UI", "微软雅黑"]));
  });
});
