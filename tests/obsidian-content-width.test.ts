import { describe, expect, it } from "vitest";
import { describeRenderedContentWidth } from "../src/obsidian-content-width";

describe("Follow Obsidian rendered content width", () => {
  it("keeps real pixels for layout and derives characters only as a hint", () => {
    expect(describeRenderedContentWidth(773.6, 18)).toEqual({
      pixels: 773.6,
      characterHint: 43,
    });
  });

  it("does not invent a default width when measurement is unavailable", () => {
    expect(describeRenderedContentWidth(0, 18)).toBeNull();
    expect(describeRenderedContentWidth(Number.NaN, 18)).toBeNull();
    expect(describeRenderedContentWidth(773.6, 0)).toBeNull();
  });
});
