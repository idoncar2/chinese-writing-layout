const FRONTMATTER_PATTERN = /^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;

export interface ExportBlock {
  kind: "paragraph" | "heading" | "blank" | "page-break";
  text: string;
  level?: number;
}

export interface ExportSource {
  title: string;
  markdown: string;
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/^[ \t]{0,3}>[ \t]?/, "")
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[ \t]+$/g, "");
}

export function markdownToExportBlocks(
  markdown: string,
  stripMarkdown = true,
): ExportBlock[] {
  const source = markdown.replace(FRONTMATTER_PATTERN, "");
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
      blocks.push({ kind: "heading", level: heading[1].length, text: cleanInlineMarkdown(heading[2]).trim() });
      continue;
    }
    if (!inFence && /^[ \t]*(?:---+|___+|\*\*\*+)[ \t]*$/.test(rawLine)) {
      blocks.push({ kind: "blank", text: "" });
      continue;
    }
    const text = cleanInlineMarkdown(rawLine);
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
    if (index > 0) result.push({ kind: "page-break", text: "" });
    if (includeFileTitles) {
      result.push({ kind: "heading", level: 1, text: source.title });
    }
    result.push(...markdownToExportBlocks(source.markdown, stripMarkdown));
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
  while (
    pathExists(`写作导出/${candidate}.${safeExtension}`) ||
    pathExists(`写作导出/${candidate}-第1页.${safeExtension}`)
  ) {
    candidate = `${safeName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
