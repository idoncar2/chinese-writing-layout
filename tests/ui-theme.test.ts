import { describe, expect, it } from "vitest";
import {
  getAccentContrastColor,
  normalizeAccentColor,
  normalizeInterfaceAccentMode,
} from "../src/ui-theme";

describe("interface accent theme", () => {
  it("normalizes full and shorthand hex colors", () => {
    expect(normalizeAccentColor(" #A1B2C3 ")).toBe("#a1b2c3");
    expect(normalizeAccentColor("#abc")).toBe("#aabbcc");
    expect(normalizeAccentColor("not-a-color")).toBe("#bd765f");
  });

  it("chooses readable foreground colors", () => {
    expect(getAccentContrastColor("#f4e6dc")).toBe("#111827");
    expect(getAccentContrastColor("#213547")).toBe("#ffffff");
  });

  it("falls back to following the Obsidian theme", () => {
    expect(normalizeInterfaceAccentMode("custom")).toBe("custom");
    expect(normalizeInterfaceAccentMode("unknown")).toBe("theme");
  });
});
