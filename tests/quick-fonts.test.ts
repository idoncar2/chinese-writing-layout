import { describe, expect, it } from "vitest";
import {
  findAvailableQuickFont,
  isSystemFontAvailable,
  QUICK_FONT_OPTIONS,
  resolveRecommendedFontName,
} from "../src/quick-fonts";

describe("quick system font options", () => {
  it("offers four small cross-platform candidate lists without generic fallbacks", () => {
    expect(QUICK_FONT_OPTIONS.map((option) => option.label)).toEqual([
      "宋体",
      "黑体",
      "楷体",
      "仿宋",
    ]);
    expect(QUICK_FONT_OPTIONS).toHaveLength(4);
    for (const option of QUICK_FONT_OPTIONS) {
      expect(option.candidates.length).toBeGreaterThan(0);
      expect(option.candidates).not.toContain("serif");
      expect(option.candidates).not.toContain("sans-serif");
    }
  });

  it("returns the first available candidate without scanning a font list", () => {
    const option = QUICK_FONT_OPTIONS.find((candidate) => candidate.id === "kai")!;
    const checked: string[] = [];
    expect(findAvailableQuickFont(option, (candidate) => {
      checked.push(candidate);
      return candidate === option.candidates[1];
    })).toBe(option.candidates[1]);
    expect(checked).toEqual(option.candidates.slice(0, 2));
  });

  it("does not treat FontFaceSet.check alone as proof that a mobile font exists", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const context = {
      font: "",
      measureText: () => ({ width: 100 }),
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        fonts: { check: () => true },
        createElement: () => ({ getContext: () => context }),
      },
    });
    try {
      expect(isSystemFontAvailable("SimSun")).toBe(false);
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  it("uses the current Obsidian font when the recommended stack is unavailable", () => {
    expect(resolveRecommendedFontName(
      '"思源宋体", "Source Han Serif SC", serif',
      '"霞鹜文楷", serif',
      () => false,
    )).toBe("霞鹜文楷");
    expect(resolveRecommendedFontName(
      '"思源宋体", "宋体", serif',
      '"霞鹜文楷", serif',
      (fontFamily) => fontFamily === "宋体",
    )).toBe("宋体");
  });
});
