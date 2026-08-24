import { describe, expect, it } from "vitest";
import {
  analyzeChineseText,
  countWritingCharacters,
  isProseLine,
} from "../src/text-analysis";

describe("analyzeChineseText", () => {
  it("finds half-width punctuation beside Chinese text", () => {
    const issues = analyzeChineseText("你去哪?");
    expect(issues.some((issue) => issue.kind === "halfwidth-punctuation")).toBe(
      true,
    );
  });

  it("finds unmatched Chinese quotation marks", () => {
    const issues = analyzeChineseText("“我不知道。\n下一段");
    expect(issues.some((issue) => issue.kind === "unmatched-pair")).toBe(true);
  });

  it("ignores punctuation inside fenced code", () => {
    const issues = analyzeChineseText("```text\n中文?\n```");
    expect(issues).toHaveLength(0);
  });

  it("flags manual paragraph indentation", () => {
    const issues = analyzeChineseText("　　这是正文。\n- 这是列表");
    expect(issues.some((issue) => issue.kind === "raw-indentation")).toBe(true);
  });
});

describe("countWritingCharacters", () => {
  it("omits frontmatter and whitespace", () => {
    expect(countWritingCharacters("---\ntitle: 测试\n---\n你好， 世界。"))
      .toBe(6);
  });
});

describe("isProseLine", () => {
  it("accepts prose and rejects markdown structure", () => {
    expect(isProseLine("这是正文。", false)).toBe(true);
    expect(isProseLine("## 标题", false)).toBe(false);
    expect(isProseLine("- 列表", false)).toBe(false);
  });
});
