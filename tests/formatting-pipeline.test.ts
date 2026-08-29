import { describe, expect, it } from "vitest";
import { createDisabledFormattingRules } from "../src/formatting";
import { applyFormattingPipeline } from "../src/formatting-pipeline";
import {
  DEFAULT_FORMATTING_RULE_ORDER,
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
} from "../src/types";

describe("applyFormattingPipeline", () => {
  it("repairs only pairs that actually contain misplaced boundary whitespace", () => {
    const source = [
      "合法正文**文字**继续",
      "**文字 **正文",
      "正文** 文字**",
      "**你好**，世界",
    ].join("\n");

    expect(applyFormattingPipeline(
      source,
      createDisabledFormattingRules(),
      DEFAULT_FORMATTING_RULE_ORDER,
      { ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "repair" },
    )).toBe([
      "合法正文**文字**继续",
      "**文字** 正文",
      "正文 **文字**",
      "**你好**，世界",
    ].join("\n"));
  });

  it("adds manual indentation once per paragraph instead of once per Markdown segment", () => {
    expect(applyFormattingPipeline(
      "正文 **粗体** 后文\n*整行斜体*",
      {
        ...createDisabledFormattingRules(),
        addManualIndentation: true,
      },
      DEFAULT_FORMATTING_RULE_ORDER,
      DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
    )).toBe("　　正文 **粗体** 后文\n　　*整行斜体*");
  });

  it("does not turn a standalone Obsidian embed into an indented code block", () => {
    expect(applyFormattingPipeline(
      "![[插图.png]]\n![说明](images/picture.png)\n正文",
      {
        ...createDisabledFormattingRules(),
        addManualIndentation: true,
      },
      DEFAULT_FORMATTING_RULE_ORDER,
      DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
    )).toBe("![[插图.png]]\n![说明](images/picture.png)\n　　正文");
  });

  it("does not rewrite link destinations or Obsidian paths during repair", () => {
    const source = "[标签] ( https://example.com/a-b?q=1 ) [[ 页面 名称 | 别名 ]]";
    expect(applyFormattingPipeline(
      source,
      createDisabledFormattingRules(),
      DEFAULT_FORMATTING_RULE_ORDER,
      { ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "repair" },
    )).toBe(source);
  });

  it("does not repair emphasis-like text inside relative link or wiki targets", () => {
    const source = "[标签](docs/** 路径 **.md) [[页面 ** 名称 **|别名]]";
    expect(applyFormattingPipeline(
      source,
      createDisabledFormattingRules(),
      DEFAULT_FORMATTING_RULE_ORDER,
      { ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "repair" },
    )).toBe(source);
  });

  it("keeps multi-backtick code content exact when stripping Markdown", () => {
    expect(applyFormattingPipeline(
      "正文 ``const `value` = 1;`` 结束",
      createDisabledFormattingRules(),
      DEFAULT_FORMATTING_RULE_ORDER,
      { ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "strip" },
    )).toBe("正文 const `value` = 1; 结束");
  });
});
