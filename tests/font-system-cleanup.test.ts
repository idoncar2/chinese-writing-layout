import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const fontOptionsSource = readFileSync(resolve("src/font-options.ts"), "utf8");
const systemFontsSource = readFileSync(resolve("src/system-fonts.ts"), "utf8");
const typesSource = readFileSync(resolve("src/types.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("legacy font system cleanup", () => {
  it("removes the obsolete combination and fallback model", () => {
    expect(existsSync(resolve("src/font-presets.ts"))).toBe(false);
    expect(fontOptionsSource).not.toContain("FONT_PRESET_OPTIONS");
    expect(mainSource).not.toContain("CustomFontPreset");
    expect(mainSource).not.toMatch(/\bconst\s+customFontPresets\b/);
    expect(mainSource).not.toContain("getCustomFontPresets");
    expect(mainSource).not.toContain("saveCustomFontPreset");
    expect(mainSource).not.toContain("renameCustomFontPreset");
    expect(mainSource).not.toContain("deleteCustomFontPreset");
    expect(typesSource).not.toContain("CustomFontPreset");
    expect(typesSource).not.toContain("customFontPresets");
    expect(typesSource).not.toContain("FontFallback");
  });

  it("does not retain full system-font scanning or its unused UI styles", () => {
    expect(systemFontsSource).not.toContain("queryWindowsRegistry");
    expect(systemFontsSource).not.toContain("queryBrowserFonts");
    expect(systemFontsSource).not.toContain("getInstalledFontFamilies");
    expect(systemFontsSource).not.toContain("extractWindowsFontFamilies");
    expect(systemFontsSource).toContain("extractFontFamilyNames");
    expect(systemFontsSource).toContain("fontNameToCssFamily");
    expect(styles).not.toContain(".cw-font-custom-");
    expect(styles).not.toContain(".cw-font-selected-");
    expect(styles).not.toContain(".cw-font-fallback-setting");
    expect(styles).not.toContain(".cw-font-presets");
    expect(styles).not.toContain(".cw-font-search");
    expect(styles).not.toContain(".cw-font-option");
  });
});
