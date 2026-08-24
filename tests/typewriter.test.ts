import { describe, expect, it } from "vitest";
import { calculateTypewriterScrollDelta } from "../src/editor-extension";
import {
  normalizePaperTheme,
  normalizeTypewriterCursorPosition,
  shouldRepositionTypewriter,
} from "../src/types";

describe("typewriter cursor positioning", () => {
  it("calculates the scroll delta for configurable viewport positions", () => {
    expect(calculateTypewriterScrollDelta(600, 100, 1000, 50)).toBe(0);
    expect(calculateTypewriterScrollDelta(600, 100, 1000, 30)).toBe(200);
    expect(calculateTypewriterScrollDelta(600, 100, 1000, 70)).toBe(-200);
  });

  it("normalizes saved positions to the nearest supported choice", () => {
    expect(normalizeTypewriterCursorPosition(44)).toBe(40);
    expect(normalizeTypewriterCursorPosition(68)).toBe(70);
    expect(normalizeTypewriterCursorPosition(undefined)).toBe(50);
  });

  it("does not reposition for unrelated sidebar setting changes", () => {
    expect(shouldRepositionTypewriter(50, true, 50, true)).toBe(false);
    expect(shouldRepositionTypewriter(50, true, 60, true)).toBe(true);
    expect(shouldRepositionTypewriter(50, false, 50, true)).toBe(true);
    expect(shouldRepositionTypewriter(undefined, false, 50, true)).toBe(false);
  });

  it("keeps supported paper themes and repairs unknown saved values", () => {
    expect(normalizePaperTheme("blue")).toBe("blue");
    expect(normalizePaperTheme("unknown-theme")).toBe("warm");
  });
});
