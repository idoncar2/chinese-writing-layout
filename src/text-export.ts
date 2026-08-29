import { stripInlineMarkdown } from "./markdown-formatting";
import type { ExportFormat, ExportScope } from "./types";

const FRONTMATTER_PATTERN = /^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;

export interface ExportBlock {
  kind: "paragraph" | "heading" | "blank" | "page-break";
  text: string;
  level?: number;
  sourceIndex?: number;
  sourceTitle?: string;
}

export interface ExportSource {
  title: string;
  markdown: string;
}

export type ExportContentMode = "plain-text" | "markdown";

export interface ExportContentOptions {
  format: ExportFormat;
  scope: ExportScope;
  includeFileTitles: boolean;
  stripMarkdown: boolean;
}

export interface PreparedExportContent {
  blocks?: ExportBlock[];
  text: string;
  contentMode: ExportContentMode;
  sourceCount: number;
}

export { stripInlineMarkdown } from "./markdown-formatting";

export function removeFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_PATTERN, "");
}

export function getExportContentMode(
  format: ExportFormat,
  stripMarkdown: boolean,
): ExportContentMode {
  return format === "md" || !stripMarkdown ? "markdown" : "plain-text";
}

export function combineMarkdownSources(
  sources: readonly ExportSource[],
  includeFileTitles: boolean,
): string {
  return sources
    .map((source) => {
      const parts: string[] = [];
      const markdown = removeFrontmatter(source.markdown).trim();
      if (includeFileTitles) parts.push(`# ${source.title}`);
      if (markdown) parts.push(markdown);
      return parts.join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function prepareMarkdownExportText(
  sources: readonly ExportSource[],
  scope: ExportScope,
  includeFileTitles: boolean,
): string {
  if (scope === "current" && sources.length === 1) {
    return sources[0]?.markdown ?? "";
  }
  return combineMarkdownSources(sources, includeFileTitles);
}

export function prepareExportContent(
  sources: readonly ExportSource[],
  options: ExportContentOptions,
): PreparedExportContent {
  if (options.format === "md") {
    return {
      text: prepareMarkdownExportText(
        sources,
        options.scope,
        options.scope === "folder" && options.includeFileTitles,
      ),
      contentMode: "markdown",
      sourceCount: sources.length,
    };
  }

  const blocks = combineExportSources(
    sources,
    options.scope === "folder" && options.includeFileTitles,
    options.stripMarkdown,
  );
  return {
    blocks,
    text: exportBlocksToPlainText(blocks),
    contentMode: getExportContentMode(options.format, options.stripMarkdown),
    sourceCount: sources.length,
  };
}

export interface ExportPreviewText {
  text: string;
  truncated: boolean;
}

export function truncateExportPreview(
  text: string,
  limit = 200_000,
): ExportPreviewText {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

export function markdownToExportBlocks(
  markdown: string,
  stripMarkdown = true,
): ExportBlock[] {
  const source = removeFrontmatter(markdown);
  const blocks: ExportBlock[] = [];

  if (!stripMarkdown) {
    for (const rawLine of source.split(/\r?\n/)) {
      blocks.push(rawLine.trim()
        ? { kind: "paragraph", text: rawLine }
        : { kind: "blank", text: "" });
    }
    return normalizeExportBlocks(blocks);
  }

  let inFence = false;

  for (const rawLine of source.split(/\r?\n/)) {
    if (/^[ \t]*(```+|~~~+)/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    const heading = !inFence ? rawLine.match(/^[ \t]{0,3}(#{1,6})[ \t]+(.+)$/) : null;
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: stripInlineMarkdown(heading[2]).trim() });
      continue;
    }
    if (!inFence && /^[ \t]*(?:---+|___+|\*\*\*+)[ \t]*$/.test(rawLine)) {
      blocks.push({ kind: "blank", text: "" });
      continue;
    }
    const text = stripInlineMarkdown(rawLine);
    blocks.push(text.trim() ? { kind: "paragraph", text } : { kind: "blank", text: "" });
  }

  return normalizeExportBlocks(blocks);
}

function normalizeExportBlocks(blocks: readonly ExportBlock[]): ExportBlock[] {
  const normalized: ExportBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "blank" && normalized.at(-1)?.kind === "blank") continue;
    normalized.push(block);
  }
  while (normalized[0]?.kind === "blank") normalized.shift();
  while (normalized.at(-1)?.kind === "blank") normalized.pop();
  return normalized;
}

export function combineExportSources(
  sources: readonly ExportSource[],
  includeFileTitles: boolean,
  stripMarkdown = true,
): ExportBlock[] {
  const result: ExportBlock[] = [];
  for (const [index, source] of sources.entries()) {
    if (index > 0) {
      result.push({
        kind: "page-break",
        text: "",
        sourceIndex: index,
        sourceTitle: source.title,
      });
    }
    if (includeFileTitles) {
      result.push({
        kind: "heading",
        level: 1,
        text: source.title,
        sourceIndex: index,
        sourceTitle: source.title,
      });
    }
    result.push(...markdownToExportBlocks(source.markdown, stripMarkdown).map((block) => ({
      ...block,
      sourceIndex: index,
      sourceTitle: source.title,
    })));
  }
  return result;
}

export function exportBlocksToPlainText(blocks: readonly ExportBlock[]): string {
  return blocks
    .map((block) => block.kind === "page-break" || block.kind === "blank" ? "" : block.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function markdownToPlainText(markdown: string): string {
  return exportBlocksToPlainText(markdownToExportBlocks(markdown));
}

export function sanitizeExportName(basename: string): string {
  return basename.replace(/[\\/:*?"<>|]/g, "-").trim() || "未命名";
}

export function getAvailableExportPath(
  basename: string,
  pathExists: (path: string) => boolean,
  extension = "txt",
): string {
  const safeName = sanitizeExportName(basename);
  const safeExtension = extension.replace(/^\.+/, "").toLowerCase() || "txt";
  const basePath = `写作导出/${safeName}.${safeExtension}`;
  if (!pathExists(basePath)) return basePath;

  let suffix = 2;
  while (pathExists(`写作导出/${safeName}-${suffix}.${safeExtension}`)) suffix += 1;
  return `写作导出/${safeName}-${suffix}.${safeExtension}`;
}

export function getAvailableExportBaseName(
  basename: string,
  pathExists: (path: string) => boolean,
  extension: string,
): string {
  const safeName = sanitizeExportName(basename);
  const safeExtension = extension.replace(/^\.+/, "").toLowerCase();
  let candidate = safeName;
  let suffix = 2;
  const isPng = safeExtension === "png";
  while (
    pathExists(`写作导出/${candidate}.${safeExtension}`) ||
    pathExists(`写作导出/${candidate}-第1张.${safeExtension}`) ||
    pathExists(`写作导出/${candidate}-第1页.${safeExtension}`)
  ) {
    candidate = isPng ? `${safeName} (${suffix - 1})` : `${safeName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
