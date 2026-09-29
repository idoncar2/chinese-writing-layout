import { describe, expect, it } from "vitest";
import { phonePreviewScale, scrollProgress, scrollTarget } from "../src/reader/phone-preview-layout";

describe("phone preview layout", () => {
  it("fits a phone without changing its logical aspect ratio or enlarging it", () => {
    expect(phonePreviewScale(390, 780, 300, 600)).toBeCloseTo(300 / 390);
    expect(phonePreviewScale(390, 780, 800, 400)).toBeCloseTo(400 / 780);
    expect(phonePreviewScale(390, 780, 1000, 1000)).toBe(1);
    expect(phonePreviewScale(390, 780, 0, 0)).toBe(0);
  });

  it("maps scroll positions across differently sized documents and clamps overscroll", () => {
    const progress = scrollProgress(400, 1000, 200);
    expect(progress).toBe(0.5);
    expect(scrollTarget(progress, 2000, 600)).toBe(700);
    expect(scrollProgress(-30, 1000, 200)).toBe(0);
    expect(scrollProgress(2000, 1000, 200)).toBe(1);
    expect(scrollProgress(100, 200, 300)).toBe(0);
    expect(scrollTarget(1, 200, 300)).toBe(0);
    expect(scrollTarget(2, 1000, 200)).toBe(800);
  });
});
