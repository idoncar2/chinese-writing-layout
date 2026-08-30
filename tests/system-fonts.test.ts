import { describe, expect, it } from "vitest";
import {
  extractFontFamilyNames,
  fontNameToCssFamily,
  getPrimaryFontName,
  getSystemFontDisplayName,
} from "../src/system-fonts";

describe("single-font helpers", () => {
  it("extracts readable names from CSS font stacks", () => {
    const stack = '"霞鹜文楷", "Microsoft YaHei", sans-serif';
    expect(extractFontFamilyNames(stack)).toEqual(["霞鹜文楷", "Microsoft YaHei"]);
    expect(getPrimaryFontName(stack)).toBe("霞鹜文楷");
  });

  it("quotes one selected font name safely", () => {
    expect(fontNameToCssFamily('Writer "Book"')).toBe('"Writer \\"Book\\""');
  });

  it("treats inherit and generic-only values as having no selected font", () => {
    expect(extractFontFamilyNames("inherit")).toEqual([]);
    expect(getPrimaryFontName("inherit")).toBe("跟随正文");
  });

  it("turns technical font aliases into honest user-facing names", () => {
    expect(getSystemFontDisplayName("Apple system")).toBe("系统默认字体");
    expect(getSystemFontDisplayName("-apple-system")).toBe("系统默认字体");
    expect(getSystemFontDisplayName("SimSun")).toBe("宋体（SimSun）");
    expect(getSystemFontDisplayName("思源宋体")).toBe("优先思源宋体");
    expect(getSystemFontDisplayName("Unknown Font")).toBe("Unknown Font");
  });
});
