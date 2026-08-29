import { describe, expect, it } from "vitest";
import {
  applyMarkdownFormatting,
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
} from "../src/markdown-formatting";
import { normalizeMarkdownFormattingOptions } from "../src/types";

describe("applyMarkdownFormatting", () => {
  it("keeps YAML and fenced code intact while stripping Markdown from normal content", () => {
    const source = [
      "---",
      "title: **保留原样**",
      "---",
      "# 标题",
      "> 引用 **粗体**",
      "- 列表项目",
      "正文含有 [链接](https://example.com) 与 [[页面|别名]]。",
      "\`\`\`ts",
      "# 代码标题",
      "const value = \`保持\`;",
      "\`\`\`",
    ].join("\n");

    expect(applyMarkdownFormatting(source, {
      ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
      mode: "strip",
    })).toBe([
      "---",
      "title: **保留原样**",
      "---",
      "标题",
      "引用 粗体",
      "列表项目",
      "正文含有 链接 与 别名。",
      "\`\`\`ts",
      "# 代码标题",
      "const value = \`保持\`;",
      "\`\`\`",
    ].join("\n"));
  });

  it("repairs only selected, deterministic Markdown spacing", () => {
    const source = [
      "-项目",
      ">引用",
      "** 粗体 **、* 斜体 *、~~ 删除 ~~、\` 代码 \`",
      "[链接] (https://example.com) 与 [[页面|别名]]",
      "残缺 ** 粗体",
      "[未闭合](https://example.com",
    ].join("\n");

    expect(applyMarkdownFormatting(source, {
      ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
      mode: "repair",
    })).toBe([
      "- 项目",
      "> 引用",
      "**粗体**、*斜体*、~~删除~~、\` 代码 \`",
      "[链接](https://example.com) 与 [[页面|别名]]",
      "残缺 ** 粗体",
      "[未闭合](https://example.com",
    ].join("\n"));
  });

  it("leaves content unchanged when Markdown handling is disabled", () => {
    const source = "# 标题\n-项目\n** 粗体 **";
    expect(applyMarkdownFormatting(source, DEFAULT_MARKDOWN_FORMATTING_OPTIONS)).toBe(source);
  });

  it("does not mistake a valid whole-line italic span for a list missing its space", () => {
    expect(applyMarkdownFormatting("*正常斜体*", {
      ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
      mode: "repair",
    })).toBe("*正常斜体*");
  });

  it("defaults syntax protection on while preserving an explicit false", () => {
    expect(normalizeMarkdownFormattingOptions({}).protectSyntax).toBe(true);
    expect(normalizeMarkdownFormattingOptions({ protectSyntax: false }).protectSyntax).toBe(false);
    expect(normalizeMarkdownFormattingOptions({ repair: { heading: false } }).repair.heading).toBe(false);
  });

  it("repairs paired emphasis and structural prefixes without touching URLs", () => {
    const source = [
      "##标题",
      ">引用 **文字 **正文",
      "正文** 文字**、* 斜体 *、~~ 删除 ~~",
      "-[X] 项目",
      "[标签] (https://example.com/a?x=1)",
    ].join("\n");
    expect(applyMarkdownFormatting(source, {
      ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
      mode: "repair",
    })).toBe([
      "## 标题",
      "> 引用 **文字** 正文",
      "正文 **文字**、*斜体*、~~删除~~",
      "- [x] 项目",
      "[标签](https://example.com/a?x=1)",
    ].join("\n"));
  });

  it("strips visible Markdown while preserving YAML and fenced code", () => {
    const source = [
      "---",
      "title: **原样**",
      "---",
      "## **标题**",
      "- [x] **项目**",
      "> ~~引用~~",
      "![图片](https://example.com/a.png) [[目标|别名]] `代码`",
      "~~~",
      "- [x] **代码**",
      "~~~",
    ].join("\n");
    expect(applyMarkdownFormatting(source, {
      ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
      mode: "strip",
    })).toBe([
      "---",
      "title: **原样**",
      "---",
      "标题",
      "项目",
      "引用",
      "图片 别名 代码",
      "~~~",
      "- [x] **代码**",
      "~~~",
    ].join("\n"));
  });

  it("keeps hard breaks and remains idempotent across CRLF", () => {
    const source = "##标题\r\n正文  \r\n正文** 文字**";
    const options = { ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "repair" as const };
    const repaired = applyMarkdownFormatting(source, options);
    expect(repaired).toBe("## 标题\r\n正文  \r\n正文 **文字**");
    expect(applyMarkdownFormatting(repaired, options)).toBe(repaired);
  });
});
