import { describe, expect, it, vi } from "vitest";
import {
  getObsidianFontDisplayName,
  normalizeObsidianFontFamily,
  readObsidianHeadingSizes,
  readObsidianTypographyBaseline,
} from "../src/obsidian-baseline";

describe("Obsidian typography baseline", () => {
  it("shows the semantic default label when Obsidian exposes no usable font name", () => {
    expect(getObsidianFontDisplayName("'??'")).toBe("默认");
    expect(getObsidianFontDisplayName("serif")).toBe("默认");
    expect(getObsidianFontDisplayName('"Obsidian Sans", sans-serif')).toBe("Obsidian Sans");
  });

  it("prefers Obsidian's editor font variable over a plugin fallback font", () => {
    const obsidianFontFamily = '"Obsidian Editor", sans-serif';
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-editor": obsidianFontFamily,
      }[name] ?? ""),
      fontFamily: '"思源宋体", serif',
    }));

    try {
      const baseline = readObsidianTypographyBaseline({} as HTMLElement);
      expect(baseline.fontFamily).toBe(obsidianFontFamily);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the computed font family when the theme variable is unavailable", () => {
    const computedFontFamily = '"Obsidian UI", "Microsoft YaHei", sans-serif';
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-text-size": "17px",
        "--line-height-normal": "1.6",
        "--p-spacing": "0.5em",
        "--letter-spacing": "0.25px",
      }[name] ?? ""),
      fontFamily: computedFontFamily,
    }));

    try {
      const baseline = readObsidianTypographyBaseline({} as HTMLElement);
      expect(baseline.fontFamily).toBe(computedFontFamily);
      expect(baseline.fontSize).toBe(17);
      expect(baseline.lineHeight).toBe(1.6);
      expect(baseline.letterSpacing).toBe(0.25);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not treat Obsidian's question-mark font sentinel as a saved font", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-editor": "'??'",
        "--font-text-theme": "'??'",
      }[name] ?? ""),
      fontFamily: "'??'",
    }));

    try {
      const baseline = readObsidianTypographyBaseline({} as HTMLElement);
      expect(baseline.fontFamily).toBe("inherit");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls through an unusable editor font variable to a usable theme font", () => {
    const themeFontFamily = '"Obsidian Text", sans-serif';
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-editor": "'??'",
        "--font-text-theme": themeFontFamily,
      }[name] ?? ""),
      fontFamily: "'??'",
    }));

    try {
      const baseline = readObsidianTypographyBaseline({} as HTMLElement);
      expect(baseline.fontFamily).toBe(themeFontFamily);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normalizes persisted Obsidian placeholders to native inheritance", () => {
    expect(normalizeObsidianFontFamily("'??'", '"思源宋体", serif')).toBe("inherit");
    expect(normalizeObsidianFontFamily(undefined, '"思源宋体", serif')).toBe('"思源宋体", serif');
  });

  it("resolves em heading sizes against the theme body font size", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-text-size": "17px",
        "--h1-size": "2em",
        "--h2-size": "1.5em",
        "--h3-size": "1.25em",
        "--h4-size": "1em",
        "--h5-size": "0.9em",
        "--h6-size": "0.8em",
      }[name] ?? ""),
    }));

    try {
      const sizes = readObsidianHeadingSizes({} as HTMLElement);
      // 正文字号 17px，2em → 34px；标题档位按主题基准解析，而不是按插件改过的正文。
      expect(sizes.h1).toBeCloseTo(34, 6);
      expect(sizes.h2).toBeCloseTo(25.5, 6);
      expect(sizes.h3).toBeCloseTo(21.25, 6);
      expect(sizes.h4).toBeCloseTo(17, 6);
      expect(sizes.h5).toBeCloseTo(15.3, 6);
      expect(sizes.h6).toBeCloseTo(13.6, 6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes px sizes through and resolves var() references for the inline title", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-text-size": "16px",
        "--h1-size": "24px",
        "--inline-title-size": "var(--h1-size)",
      }[name] ?? ""),
    }));

    try {
      const sizes = readObsidianHeadingSizes({} as HTMLElement);
      expect(sizes.h1).toBe(24);
      // Obsidian 默认 --inline-title-size: var(--h1-size)，解析为同一档位。
      expect(sizes["inline-title"]).toBe(24);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves a heading level unset when the theme value cannot be parsed", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => ({
        "--font-text-size": "16px",
        "--h3-size": "calc(1em + 2px)",
        "--h1-size": "1.618em",
      }[name] ?? ""),
    }));

    try {
      const sizes = readObsidianHeadingSizes({} as HTMLElement);
      expect(sizes.h1).toBeCloseTo(25.888, 3);
      expect(sizes.h3).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
