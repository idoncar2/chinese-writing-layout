import { describe, expect, it } from "vitest";
import { applyFormattingRules, createDisabledFormattingRules } from "../src/formatting";
import {
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
  type FormattingRules,
  type MarkdownFormattingOptions,
} from "../src/types";

type ChapterHeadingFormat = "arabic-unit" | "chinese-unit" | "chinese-parenthesized" | "arabic-list";

function format(text: string, target: ChapterHeadingFormat): string {
  const rules = {
    ...createDisabledFormattingRules(),
    normalizeChapterHeadingFormat: true,
  } as FormattingRules & { normalizeChapterHeadingFormat: boolean };
  const markdown = {
    ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
    chapterHeadingFormat: target,
  } as MarkdownFormattingOptions & { chapterHeadingFormat: ChapterHeadingFormat };
  return applyFormattingRules(text, rules, undefined, markdown);
}

describe("Markdown chapter heading format", () => {
  it("converts Chinese chapter and volume numbers to Arabic while preserving titles", () => {
    expect(format("# 第一章\n## 第十二章 春天\n### 第一百零八章　归来\n#### 第二卷", "arabic-unit"))
      .toBe("# 第1章\n## 第12章 春天\n### 第108章 归来\n#### 第2卷");
  });

  it("converts all supported sources to standard Chinese unit numbers", () => {
    expect(format("# 第108章 归来\n## （十二） 春天\n### 2、 开端", "chinese-unit"))
      .toBe("# 第一百零八章 归来\n## 第十二章 春天\n### 第二章 开端");
  });

  it("supports Chinese parenthesized and Arabic list targets", () => {
    expect(format("## 第二卷 风起", "chinese-parenthesized")).toBe("## （二） 风起");
    expect(format("## 第十二章 春天", "arabic-list")).toBe("## 12、 春天");
  });

  it("is idempotent and normalizes the title separator to one half-width space", () => {
    const once = format("## （一百零八）　　归来", "chinese-parenthesized");
    expect(once).toBe("## （一百零八） 归来");
    expect(format(once, "chinese-parenthesized")).toBe(once);
  });

  it("leaves ordinary text, protected Markdown, ambiguous labels and out-of-range numbers unchanged", () => {
    const source = [
      "第一章 正文里提到章节。",
      "---",
      "title: 第十二章",
      "---",
      "```text",
      "# 第十二章",
      "```",
      "# 序章",
      "## 上卷",
      "### 故事里的第一章",
      "#### 第10000章 太远",
      "##### 第一二章 模糊",
    ].join("\n");
    expect(format(source, "arabic-unit")).toBe(source);
  });
});
