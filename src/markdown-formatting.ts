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

function repairDelimitedPair(line: string, marker: string): string {
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
    if (!leading && !trailing) return whole;
    const trimmed = content.trim();
    if (!trimmed || trimmed.includes(marker)) return whole;
    const before = source[offset - 1];
    const after = source[offset + whole.length];
    const prefix = leading && before && !isNoSpaceBefore(before) ? " " : "";
    const suffix = trailing && after && !isNoSpaceAfter(after) ? " " : "";
    return `${prefix}${marker}${trimmed}${marker}${suffix}`;
  });
}

function repairStrong(line: string): string {
  return repairDelimitedPair(repairDelimitedPair(line, "**"), "__");
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
    /^[ \t]{0,3}(?:[-+*](?=[ \t]|\[[ xX]\])|\d+[.)](?=[ \t]))[ \t]*(?:\[[ xX]\][ \t]*)?/,
    "",
  );
  return result;
}

/** Remove common inline Markdown while retaining the text a reader sees. */
export function stripInlineMarkdown(text: string): string {
  let result = stripPrefix(text);
  const codeValues: string[] = [];
  result = replaceInlineCodeSpans(result, (_whole, content) => {
    const index = codeValues.push(content) - 1;
    return `\uE100${index}\uE101`;
  });
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
      .replace(/(?<!\*)\*\s*([^*\n]*?\S)\s*\*(?!\*)/g, "$1")
      .replace(/(?<!_)_\s*([^_\n]*?\S)\s*_(?!_)/g, "$1");
    if (result === previous) break;
  }
  result = result.replace(/\uE100(\d+)\uE101/g, (_match, index: string) => codeValues[Number(index)]);
  return result.replace(/[ \t]{2,}$/u, "").replace(/[ \t]+$/u, "");
}

function stripMarkdownLine(line: string): string {
  if (/^[ \t]*(?:---+|___+|\*\*\*+)[ \t]*$/.test(line)) return "";
  return stripInlineMarkdown(stripPrefix(line));
}

export function applyMarkdownFormatting(
  text: string,
  options: MarkdownFormattingOptions,
): string {
  const normalized = normalizeMarkdownFormattingOptions(options);
  if (normalized.mode === "none") return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const contexts = getMarkdownLineContexts(lines);
  return lines.map((line, index) => {
    if (contexts[index].stronglyProtected) return line;
    if (normalized.mode === "strip") return stripMarkdownLine(line);
    return repairMarkdownLine(line, normalized);
  }).join(newline);
}
