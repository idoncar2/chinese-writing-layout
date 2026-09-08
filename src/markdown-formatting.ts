import {
  getMarkdownLineContexts,
  replaceInlineCodeSpans,
} from "./markdown-protection";
import {
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
  normalizeMarkdownFormattingOptions,
} from "./types";
import type { MarkdownFormattingOptions } from "./types";

export { DEFAULT_MARKDOWN_FORMATTING_OPTIONS } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNoSpaceAfter(character: string | undefined): boolean {
  return !character || /[\s，。！？；：、,.!?;:)\]}»”’]/u.test(character);
}

function isNoSpaceBefore(character: string | undefined): boolean {
  return !character || /\s/u.test(character)
    || "（【《([{<“‘，。！？；：、,.!?;:)]}》】”’".includes(character);
}

function repairDelimitedPair(
  line: string,
  marker: string,
  repairExternalBoundaries = false,
): string {
  const escaped = escapeRegExp(marker);
  const contentCharacter = marker[0] === "~" ? "~" : marker[0];
  const boundary = marker.length === 1 ? `(?<!${escaped})${escaped}(?!${escaped})` : escaped;
  const expression = new RegExp(
    `${boundary}([ \\t]*)([^${escapeRegExp(contentCharacter)}\\n]*?)([ \\t]*)${boundary}`,
    "g",
  );
  return line.replace(expression, (
    whole,
    leading: string,
    content: string,
    trailing: string,
    offset: number,
    source: string,
  ) => {
    if (!repairExternalBoundaries && !leading && !trailing) return whole;
    const trimmed = content.trim();
    if (!trimmed || trimmed.includes(marker)) return whole;
    const before = source[offset - 1];
    const after = source[offset + whole.length];
    const prefix = (repairExternalBoundaries || leading)
      && before && !isNoSpaceBefore(before) ? " " : "";
    const suffix = (repairExternalBoundaries || trailing)
      && after && !isNoSpaceAfter(after) ? " " : "";
    return `${prefix}${marker}${trimmed}${marker}${suffix}`;
  });
}

function repairStrong(line: string): string {
  return repairDelimitedPair(repairDelimitedPair(line, "**", true), "__", true);
}

function repairItalic(line: string): string {
  return repairDelimitedPair(repairDelimitedPair(line, "*"), "_");
}

function repairStrikethrough(line: string): string {
  return repairDelimitedPair(line, "~~");
}

function repairMarkdownLinks(line: string): string {
  return line.replace(
    /(!?\[[^\]\n]+\])[ \t]+\(([^)\n]+)\)/g,
    (whole, label: string, target: string) =>
      target === target.trim() ? `${label}(${target})` : whole,
  );
}

function repairObsidianLinks(line: string): string {
  // Spaces may be part of an Obsidian file name or alias. Complete wiki
  // links are therefore already structurally valid and remain byte-exact.
  return line;
}

function repairHeading(line: string): string {
  // A single # may be a tag. Only repair malformed 2–6 level headings.
  return line.replace(/^([ \t]{0,3})(#{2,6})(?=\S)(?!#)/, "$1$2 ");
}

function repairList(line: string): string {
  if (/^[ \t]{0,3}(?:\*\*|---|___)/.test(line)) return line;
  if (/^[ \t]{0,3}\*[^*\n]+\*$/.test(line)) return line;
  const task = line.match(/^([ \t]{0,3})([-+*]|\d+[.)])[ \t]*\[([ xX])\][ \t]*(.*)$/);
  if (task) return `${task[1]}${task[2]} [${task[3].toLowerCase()}] ${task[4]}`.replace(/[ \t]+$/u, "");
  const match = line.match(/^([ \t]{0,3})([-+*]|\d+[.)])[ \t]*(\S.*)$/);
  return match ? `${match[1]}${match[2]} ${match[3]}` : line;
}

function repairBlockquote(line: string): string {
  const match = line.match(/^([ \t]{0,3}>+)[ \t]*(\S.*)$/);
  return match ? `${match[1]} ${match[2]}` : line;
}

function maskCodeAndUrls(line: string): { masked: string; restore: (value: string) => string } {
  const values: string[] = [];
  const placeholder = (index: number): string => `\uE000${index}\uE001`;
  const protect = (value: string): string => {
    const index = values.push(value) - 1;
    return placeholder(index);
  };
  let masked = line.replace(/!?\[\[[^\]\n]+\]\]/g, protect);
  masked = masked.replace(
    /(!?\[[^\]\n]*\][ \t]*\()([^)\n]*)(\))/g,
    (whole, opening: string, target: string, closing: string) => {
      const leading = target.match(/^[ \t]*/u)?.[0] ?? "";
      const trailing = target.match(/[ \t]*$/u)?.[0] ?? "";
      const end = trailing ? target.length - trailing.length : target.length;
      const core = target.slice(leading.length, end);
      return core ? `${opening}${leading}${protect(core)}${trailing}${closing}` : whole;
    },
  );
  masked = replaceInlineCodeSpans(masked, protect);
  masked = masked.replace(/(?:https?:\/\/|mailto:)[^\s<>()[\]]+/giu, (value) => {
    return protect(value);
  });
  const unmatched = masked.indexOf("`");
  if (unmatched >= 0) {
    const index = values.push(masked.slice(unmatched)) - 1;
    masked = `${masked.slice(0, unmatched)}${placeholder(index)}`;
  }
  return {
    masked,
    restore: (value: string) => value.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => values[Number(index)]),
  };
}

function normalizeTaskCheckbox(line: string): string {
  return line.replace(
    /^([ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]*)\[([xX ])\]/,
    (_match, prefix: string, state: string) => `${prefix}[${state.toLowerCase()}]`,
  );
}

function repairMarkdownLine(line: string, options: MarkdownFormattingOptions): string {
  const data = maskCodeAndUrls(line);
  let repaired = data.masked;
  if (options.repair.markdownLink) repaired = repairMarkdownLinks(repaired);
  if (options.repair.obsidianLink) repaired = repairObsidianLinks(repaired);
  if (options.repair.heading) repaired = repairHeading(repaired);
  if (options.repair.bold) repaired = repairStrong(repaired);
  if (options.repair.italic) repaired = repairItalic(repaired);
  if (options.repair.strikethrough) repaired = repairStrikethrough(repaired);
  // Inline code is intentionally not rewritten. The legacy option remains
  // accepted, but code spans are always protected.
  if (options.repair.list) repaired = repairList(repaired);
  if (options.repair.blockquote) repaired = repairBlockquote(repaired);
  if (options.repair.list) repaired = normalizeTaskCheckbox(repaired);
  return data.restore(repaired);
}

function stripPrefix(line: string): string {
  let result = line;
  const heading = /^([ \t]{0,3})(#{1,6})([ \t]*)(.*)$/u.exec(result);
  if (heading && (heading[3].length > 0 || heading[2].length >= 2)) {
    result = heading[4];
  }
  result = result.replace(/^(?:(?:[ \t]{0,3}>+)[ \t]?)+/, "");
  result = result.replace(
    /^[ \t]*(?:[-+*](?=[ \t]|\[[ xX]\])|\d+[.)](?=[ \t]))[ \t]*(?:\[[ xX]\][ \t]*)?/,
    "",
  );
  return result
    .replace(/^\[![\w-]+\][+-]?(?:[ \t]+|$)/, "")
    .replace(/^[ \t]*\[\^[^\]\n]+\]:[ \t]*/, "");
}

/** Remove common inline Markdown while retaining the text a reader sees. */
export function stripInlineMarkdown(text: string, tableRow = false): string {
  let result = text;
  const codeValues: string[] = [];
  const protect = (content: string): string => `\uE100${codeValues.push(content) - 1}\uE101`;
  result = replaceInlineCodeSpans(result, (_whole, content) => {
    return protect(content);
  });
  result = result.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, (_whole, literal: string) => protect(literal));
  result = stripPrefix(result);
  result = result.replace(/%%.*?%%/g, "")
    .replace(/\$\$(.+?)\$\$/g, (_whole, content: string) => protect(content))
    .replace(/(?<!\$)\$(?![\s$])([^$\n]*?\S)\$(?![\d$])/g, (_whole, content: string) => protect(content))
    .replace(/\[\^[^\]\n]+\]/g, "");
  if (tableRow) {
    // Protect wiki aliases before splitting the actual table delimiters.
    result = result.replace(/!?\[\[([^\]\n]+)\]\]/g, (_whole, body: string) => protect(stripInlineMarkdown(`[[${body}]]`)));
    result = result.trim().replace(/^\|/, "").replace(/\|$/, "")
      .split("|").map((cell) => cell.trim()).join("\t");
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = result;
    result = result
      .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
      .replace(/\[([^\]\n]+)\]\([^\)\n]*\)/g, "$1")
      .replace(/!??\[\[([^\]|\n]+)\|([^\]\]\n]+)\]\]/g, "$2")
      .replace(/!??\[\[([^\]\]\n]+)\]\]/g, "$1")
      .replace(/`+([^`\n]*?)`+/g, "$1")
      .replace(/(\*\*|__)\s*([^\n]*?\S)\s*\1/g, "$2")
      .replace(/~~\s*([^\n]*?\S)\s*~~/g, "$1")
      .replace(/==([^=\n]+)==/g, "$1")
      .replace(/(?<!\*)\*\s*([^*\n]*?\S)\s*\*(?!\*)/g, "$1")
      .replace(/(?<!_)_\s*([^_\n]*?\S)\s*_(?!_)/g, "$1");
    if (result === previous) break;
  }
  result = result.replace(/\uE100(\d+)\uE101/g, (_match, index: string) => codeValues[Number(index)]);
  return result.replace(/[ \t]{2,}$/u, "").replace(/[ \t]+$/u, "");
}

/** Document-level syntax needs state; both formatting and export use this path. */
export function stripMarkdownLines(lines: readonly string[], preserveProtected = true): string[] {
  let fence = "";
  let frontmatter = preserveProtected && lines[0]?.trim() === "---";
  let comment = false;
  let math = false;
  let table = false;
  const separator = (line: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  return lines.map((raw, index) => {
    if (frontmatter) {
      if (index > 0 && raw.trim() === "---") frontmatter = false;
      return raw;
    }
    if (fence) {
      if (new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`).test(raw)) {
        fence = "";
        return preserveProtected ? raw : "";
      }
      return raw;
    }
    if (!comment && !math) {
      const opening = /^[ \t]*(`{3,}|~{3,})/.exec(raw);
      if (opening) { fence = opening[1]; return preserveProtected ? raw : ""; }
    }
    if (!comment && raw.trim() === "$$") { math = !math; return ""; }
    if (math) return raw;
    // Hide code while scanning comments, so literal %% does not open a comment.
    const codes: string[] = [];
    let line = replaceInlineCodeSpans(raw, (whole) => `\uE200${codes.push(whole) - 1}\uE201`);
    let visible = "";
    let cursor = 0;
    for (const match of line.matchAll(/(?<!\\)%%/g)) {
      if (!comment) visible += line.slice(cursor, match.index);
      comment = !comment;
      cursor = match.index! + 2;
    }
    if (!comment) visible += line.slice(cursor);
    line = visible.replace(/\uE200(\d+)\uE201/g, (_whole, key: string) => codes[Number(key)]);
    if (separator(line)) { table = true; return ""; }
    table = (table && line.includes("|")) || separator(lines[index + 1] ?? "");
    return table ? stripInlineMarkdown(line, true) : stripMarkdownLine(line);
  });
}

function stripMarkdownLine(line: string): string {
  if (/^[ \t]*(?:---+|___+|\*\*\*+)[ \t]*$/.test(line)) return "";
  return stripInlineMarkdown(line);
}

export function applyMarkdownFormatting(
  text: string,
  options: MarkdownFormattingOptions,
): string {
  const normalized = normalizeMarkdownFormattingOptions(options);
  if (normalized.mode === "none") return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  if (normalized.mode === "strip") return stripMarkdownLines(lines).join(newline);
  const contexts = getMarkdownLineContexts(lines);
  return lines.map((line, index) => {
    if (contexts[index].stronglyProtected) return line;
    return repairMarkdownLine(line, normalized);
  }).join(newline);
}
