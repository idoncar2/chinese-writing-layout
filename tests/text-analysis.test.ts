import { describe, expect, it } from "vitest";
import {
  analyzeChineseText,
  countCreativeWords,
  isProseLine,
  visibleMarkdownText,
} from "../src/text-analysis";

describe("visibleMarkdownText", () => {
  it("strips single italic/emphasis markers", () => {
    expect(visibleMarkdownText("_text_")).toBe("text");
    expect(visibleMarkdownText("*text*")).toBe("text");
  });

  it("preserves underscores inside words", () => {
    expect(visibleMarkdownText("a_b")).toBe("a_b");
  });

  it("strips common Markdown bold and italic", () => {
    expect(visibleMarkdownText("**bold**")).toBe("bold");
    expect(visibleMarkdownText("__bold__")).toBe("bold");
    expect(visibleMarkdownText("*bold*")).toBe("bold");
    expect(visibleMarkdownText("_italic_")).toBe("italic");
    expect(visibleMarkdownText("***bold italic***")).toBe("bold italic");
    expect(visibleMarkdownText("**bold _nested_ text**")).toBe(
      "bold nested text",
    );
  });

  it("strips Markdown markers from Chinese prose", () => {
    expect(visibleMarkdownText("**你好，世界**")).toBe("你好，世界");
    expect(visibleMarkdownText("_中文_")).toBe("中文");
    expect(visibleMarkdownText("**加粗**和*斜体*")).toBe("加粗和斜体");
  });

  it("keeps emphasis results stable for word counting", () => {
    expect(countCreativeWords("a_b")).toBe(2);
  });
});

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

describe("countCreativeWords", () => {
  it("uses the writing-calendar creative-word count for visible Markdown prose", () => {
    expect(countCreativeWords("---\ntitle: 测试\n---\n你好， 世界。"))
      .toBe(4);

    const markdown = [
      "---",
      "title: ignored",
      "---",
      "## **你好，world！** [回家](chapter-02.md) 2026 😊",
      "",
      "`inline code` and ![图片](image.png)",
      "",
      "<!-- hidden comment -->",
      "```ts",
      "const hidden = 123;",
      "```",
      "正文 ^note-id",
    ].join("\n");

    expect(countCreativeWords(markdown)).toBe(9);
  });
});

describe("isProseLine", () => {
  it("accepts prose and rejects markdown structure", () => {
    expect(isProseLine("这是正文。", false)).toBe(true);
    expect(isProseLine("## 标题", false)).toBe(false);
    expect(isProseLine("- 列表", false)).toBe(false);
  });
});
