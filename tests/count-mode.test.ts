import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as textAnalysis from "../src/text-analysis";

const countWritingText = (textAnalysis as unknown as {
  countWritingText?: (text: string, mode: "creative" | "body-characters") => number;
}).countWritingText;

describe("selectable writing count mode", () => {
  it("supports the same creative and body-character modes as writing-calendar", () => {
    expect(countWritingText).toBeTypeOf("function");
    const markdown = "---\ntitle: ignored\n---\n# A **你**!";
    expect(countWritingText?.(markdown, "creative")).toBe(2);
    expect(countWritingText?.(markdown, "body-characters")).toBe(8);
    expect(countWritingText?.("😀 👍🏽", "body-characters")).toBe(3);
  });

  it("defaults to creative words and exposes both choices in settings", () => {
    const types = readFileSync(resolve("src/types.ts"), "utf8");
    const settings = readFileSync(resolve("src/settings.ts"), "utf8");
    expect(types).toContain('countMode: "creative"');
    expect(settings).toContain('addOption("creative", "创作字数")');
    expect(settings).toContain('addOption("body-characters", "正文字符数")');
  });
});
