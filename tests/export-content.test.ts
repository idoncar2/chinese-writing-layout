import { describe, expect, it } from "vitest";
import {
  combineMarkdownSources,
  getExportContentMode,
  prepareExportContent,
  prepareMarkdownExportText,
  truncateExportPreview,
  type ExportSource,
} from "../src/text-export";
import type { ExportFormat } from "../src/types";

const richMarkdown = [
  "---",
  "tags: [draft]",
  "cssclasses: chinese-novel",
  "---",
  "# 第一章",
  "",
  "这是**重要的**、*斜体*内容，见[[人物卡|李新生]]和[资料](https://example.com)。",
  "",
  "- 第一项",
  "> 一句引用",
  "",
  "```ts",
  "const value = 1;",
  "```",
].join("\n");

const sources: ExportSource[] = [
  { title: "01 第一章", markdown: richMarkdown },
  { title: "02 第二章", markdown: "---\ntags: [draft]\n---\n## 第二章\n\n正文。" },
];

describe("export content preparation", () => {
  it("accepts Markdown as an export format", () => {
    const format: ExportFormat = "md";
    expect(format).toBe("md");
  });

  it("keeps the current editor Markdown untouched when file titles are off", () => {
    expect(prepareMarkdownExportText([sources[0]], "current", false))
      .toBe(richMarkdown);
  });

  it("combines folder Markdown with titles while removing per-file frontmatter", () => {
    const text = combineMarkdownSources(sources, true);

    expect(text).toContain("# 01 第一章");
    expect(text).toContain("# 02 第二章");
    expect(text).toContain("**重要的**");
    expect(text).toContain("[[人物卡|李新生]]");
    expect(text).toContain("```ts");
    expect(text).not.toContain("tags: [draft]");
    expect(text).not.toMatch(/^---$/m);
  });

  it("uses the selected content mode without changing the stored strip setting", () => {
    expect(getExportContentMode("md", true)).toBe("markdown");
    expect(getExportContentMode("txt", true)).toBe("plain-text");
    expect(getExportContentMode("txt", false)).toBe("markdown");

    const prepared = prepareExportContent(sources, {
      format: "md",
      scope: "folder",
      includeFileTitles: false,
      stripMarkdown: true,
    });
    expect(prepared.contentMode).toBe("markdown");
    expect(prepared.blocks).toBeUndefined();
    expect(prepared.sourceCount).toBe(2);
    expect(prepared.text).toContain("## 第二章");
  });

  it("keeps the existing block pipeline for TXT and document formats", () => {
    const prepared = prepareExportContent([sources[0]], {
      format: "txt",
      scope: "current",
      includeFileTitles: false,
      stripMarkdown: true,
    });

    expect(prepared.blocks).toBeDefined();
    expect(prepared.contentMode).toBe("plain-text");
    expect(prepared.text).not.toContain("**");
    expect(prepared.text).toContain("第一章");
  });

  it("truncates only the displayed preview text", () => {
    const fullText = "a".repeat(200_001);
    const preview = truncateExportPreview(fullText);

    expect(preview.text).toHaveLength(200_000);
    expect(preview.truncated).toBe(true);
    expect(fullText).toHaveLength(200_001);
  });
});
