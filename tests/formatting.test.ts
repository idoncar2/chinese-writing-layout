import { describe, expect, it } from "vitest";
import {
  applyFormattingRules,
  createDisabledFormattingRules,
  FORMATTING_RULE_GROUPS,
  FORMATTING_PRESETS,
} from "../src/formatting";
import {
  DEFAULT_FORMATTING_RULE_ORDER,
  type FormattingRules,
} from "../src/types";

const noRules: FormattingRules = createDisabledFormattingRules();

describe("applyFormattingRules", () => {
  it("collapses extra blank lines and ensures one blank line between prose paragraphs", () => {
    const source = "第一段。\n第二段。\n\n\n\n第三段。";
    const result = applyFormattingRules(source, {
      ...noRules,
      collapseBlankLines: true,
      ensureBlankLineBetweenParagraphs: true,
    });
    expect(result).toBe("第一段。\n\n第二段。\n\n第三段。");
  });

  it("removes extra spaces without requiring a selection", () => {
    const source = "　　这  是 中文 ，正文。   ";
    const result = applyFormattingRules(source, {
      ...noRules,
      trimTrailingWhitespace: true,
      collapseRepeatedSpaces: true,
      removeSpacesBetweenChinese: true,
      removeManualIndentation: true,
    });
    expect(result).toBe("这是中文，正文。  ");
  });

  it("removes copied indentation that Obsidian would render as a code block", () => {
    const source = "    第一段。\n\t第二段。\n\u00a0\u00a0\u00a0\u00a0第三段。";
    const result = applyFormattingRules(source, {
      ...noRules,
      trimLeadingWhitespace: true,
    });
    expect(result).toBe("第一段。\n第二段。\n第三段。");
  });

  it("adds exactly two full-width spaces to prose paragraphs", () => {
    const source = [
      "---",
      "title: 测试",
      "---",
      "第一段。",
      "  第二段。",
      "# 标题",
      "- 列表",
      "```text",
      "代码正文。",
      "```",
    ].join("\n");
    const rules = {
      ...noRules,
      addManualIndentation: true,
    };
    const result = applyFormattingRules(source, rules);

    expect(result).toBe([
      "---",
      "title: 测试",
      "---",
      "　　第一段。",
      "　　第二段。",
      "# 标题",
      "- 列表",
      "```text",
      "代码正文。",
      "```",
    ].join("\n"));
    expect(applyFormattingRules(result, rules)).toBe(result);
  });

  it("does not alter YAML or fenced code", () => {
    const source = [
      "---",
      "title: 两个  空格",
      "---",
      "正文  内容?",
      "```text",
      "代码  内容?",
      "```",
    ].join("\n");
    const result = applyFormattingRules(source, {
      ...FORMATTING_PRESETS.punctuation.rules,
    });
    expect(result).toContain("title: 两个  空格");
    expect(result).toContain("正文内容？");
    expect(result).toContain("代码  内容?");
  });

  it("preserves inline code while formatting the surrounding prose", () => {
    const source = "中文  正文? `const  value = 中文?`";
    const result = applyFormattingRules(source, {
      ...FORMATTING_PRESETS.punctuation.rules,
    });
    expect(result).toBe("中文正文？ `const  value = 中文?`");
  });

  it("supports a compact preset that removes body blank lines", () => {
    const source = "第一段。\n\n\n第二段。";
    expect(
      applyFormattingRules(source, FORMATTING_PRESETS.compact.rules),
    ).toBe("第一段。\n第二段。");
  });

  it("supports Chinese-Latin spacing, quote repair, and ellipsis normalization", () => {
    const source = '使用Obsidian写作，"很好"...';
    const result = applyFormattingRules(source, {
      ...noRules,
      addSpacesBetweenChineseAndLatin: true,
      normalizeStraightQuotes: true,
      normalizeEllipsis: true,
    });
    expect(result).toBe("使用 Obsidian 写作，“很好”……");
  });

  it("executes enabled rules in the selected order", () => {
    const rules = {
      ...noRules,
      addSpacesBetweenChineseAndLatin: true,
      removeSpacesBetweenChineseAndLatin: true,
    };
    expect(applyFormattingRules("中文English", rules, [
      "addSpacesBetweenChineseAndLatin",
      "removeSpacesBetweenChineseAndLatin",
    ])).toBe("中文English");
    expect(applyFormattingRules("中文English", rules, [
      "removeSpacesBetweenChineseAndLatin",
      "addSpacesBetweenChineseAndLatin",
    ])).toBe("中文 English");
  });

  it("formats visible Markdown bodies without changing protected syntax", () => {
    const source = "## 标题  内容 [链接 文字](https://example.com/a  b) [[目标  页面|别名 文字]] **粗 体**";
    const result = applyFormattingRules(source, {
      ...noRules,
      removeAllSpaces: true,
    });
    expect(result).toBe("## 标题内容[链接文字](https://example.com/a  b)[[目标  页面|别名文字]]**粗体**");
  });

  it("can opt out of added Markdown syntax protection while retaining strong code protection", () => {
    const source = "** 中 文 ** [标 签](https://example.com/a  b) `中 文`";
    const result = applyFormattingRules(source, {
      ...noRules,
      removeAllSpaces: true,
    }, undefined, { protectSyntax: false, mode: "none", repair: {
      bold: true, italic: true, strikethrough: true, inlineCode: true,
      markdownLink: true, obsidianLink: true, list: true, blockquote: true, heading: true,
    }});
    expect(result).toBe("**中文**[标签](https://example.com/ab)`中 文`");
  });

  it("preserves hard-break whitespace and structural prefixes", () => {
    const source = "## 标题  内容\n- [x] 列表  \n> 引用  ";
    const result = applyFormattingRules(source, {
      ...noRules,
      removeAllSpaces: true,
    });
    expect(result).toBe("## 标题内容\n- [x] 列表  \n> 引用  ");
  });
});

describe("FORMATTING_RULE_GROUPS", () => {
  it("shows every existing rule exactly once in the compact rule picker", () => {
    const groupedKeys = FORMATTING_RULE_GROUPS.flatMap((group) => group.keys);
    expect(groupedKeys).toHaveLength(DEFAULT_FORMATTING_RULE_ORDER.length);
    expect(new Set(groupedKeys)).toEqual(new Set(DEFAULT_FORMATTING_RULE_ORDER));
  });
});
