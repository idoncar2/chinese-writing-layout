import { describe, expect, it } from "vitest";
import {
  combineExportSources,
  getAvailableExportPath,
  markdownToExportBlocks,
  markdownToPlainText,
} from "../src/text-export";

describe("markdownToPlainText", () => {
  it("removes frontmatter and common markdown marks while preserving prose", () => {
    const source = [
      "---",
      "cssclasses: chinese-novel",
      "---",
      "# 第一章",
      "",
      "这是**重要的**一句，见[[人物卡|李新生]]。",
      "",
      "> 她没有回答。",
    ].join("\n");

    expect(markdownToPlainText(source)).toBe(
      "第一章\n\n这是重要的一句，见李新生。\n\n她没有回答。",
    );
  });

  it("keeps Markdown headings as structured export blocks", () => {
    expect(markdownToExportBlocks("# 第一章\n\n正文。"))
      .toEqual([
        { kind: "heading", level: 1, text: "第一章" },
        { kind: "blank", text: "" },
        { kind: "paragraph", text: "正文。" },
      ]);
  });

  it("can preserve Markdown syntax while still excluding frontmatter", () => {
    const source = [
      "---",
      "cssclasses: chinese-novel",
      "---",
      "# 第一章",
      "",
      "这是**重要的**一句，见[[人物卡|李新生]]。",
      "",
      "- 第一项",
    ].join("\n");

    const blocks = markdownToExportBlocks(source, false);
    expect(blocks.map((block) => block.text).join("\n")).toBe(
      "# 第一章\n\n这是**重要的**一句，见[[人物卡|李新生]]。\n\n- 第一项",
    );
  });

  it("combines multiple notes with page breaks and file titles", () => {
    const blocks = combineExportSources([
      { title: "01", markdown: "第一段。" },
      { title: "02", markdown: "第二段。" },
    ], true);
    expect(blocks.filter((block) => block.kind === "page-break")).toHaveLength(1);
    expect(blocks.filter((block) => block.kind === "heading").map((block) => block.text))
      .toEqual(["01", "02"]);
  });
});

describe("getAvailableExportPath", () => {
  it("never overwrites an existing export", () => {
    const existing = new Set(["写作导出/第一章.txt", "写作导出/第一章-2.txt"]);
    expect(getAvailableExportPath("第一章", (path) => existing.has(path))).toBe(
      "写作导出/第一章-3.txt",
    );
  });

  it("supports Word extensions", () => {
    expect(getAvailableExportPath("第一章", () => false, "docx")).toBe(
      "写作导出/第一章.docx",
    );
  });
});
