import { describe, expect, it } from "vitest";
import {
  extractFontFamilyNames,
  fontNameToCssFamily,
  getPrimaryFontName,
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
});
