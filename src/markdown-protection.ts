/**
 * Small, deliberately conservative Markdown tokenizer used by formatting and
 * export code. It is not a Markdown parser: it only separates syntax that is
 * safe to preserve from visible text that ordinary writing rules may edit.
 */

export type MarkdownLineKind =
  | "blank"
  | "frontmatter"
  | "fence"
  | "heading"
  | "blockquote"
  | "list"
  | "embed"
  | "image"
  | "table"
  | "thematic-break"
  | "paragraph";

export interface MarkdownLineContext {
  kind: MarkdownLineKind;
  stronglyProtected: boolean;
}

export interface MarkdownSegment {
  text: string;
  editable: boolean;
}

export interface MarkdownProtectionOptions {
  protectSyntax?: boolean;
}

const INLINE_CODE_PATTERN = /`+/g;
const URL_PATTERN = /(?:https?:\/\/|mailto:)[^\s<>()[\]]+/iu;
const HAN_OR_PUNCTUATION = /[\p{Script=Han}，。！？；：、]/u;

function pushSegment(
  segments: MarkdownSegment[],
  text: string,
  editable: boolean,
): void {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.editable === editable) {
    previous.text += text;
  } else {
    segments.push({ text, editable });
  }
}

function isFenceStart(line: string): boolean {
  return /^[ \t]{0,3}(?:`{3,}|~{3,})/.test(line);
}

function getHeadingPrefixLength(line: string): number {
  const match = /^([ \t]{0,3})(#{1,6})([ \t]*)/.exec(line);
  if (!match) return 0;
  const rest = line.slice(match[0].length);
  if (match[2].length === 1 && !match[3] && rest.length > 0) return 0;
  if (!match[3] && match[2].length < 2) return 0;
  return match[0].length;
}

function getStructuralPrefixLength(line: string): number {
  let offset = 0;
  let consumed = false;

  // A heading is a complete line prefix, and cannot be combined with a list.
  const headingLength = getHeadingPrefixLength(line);
  if (headingLength > 0) return headingLength;

  // Blockquotes and lists can be nested (for example `> - [ ] item`). Keep
  // consuming only their unambiguous prefixes; the visible body remains open.
  for (let depth = 0; depth < 8 && offset < line.length; depth += 1) {
    const quote = /^[ \t]{0,3}>+[ \t]?/.exec(line.slice(offset));
    if (quote) {
      offset += quote[0].length;
      consumed = true;
      continue;
    }
    const list = /^(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\](?:[ \t]+|$))?/.exec(
      line.slice(offset),
    );
    if (list) {
      const rest = line.slice(offset + list[0].length);
      // `---` and `***` are thematic breaks, not list markers.
      if (!(offset === 0 && /^(?:---+|___+|\*\*\*+)[ \t]*$/.test(line))) {
        offset += list[0].length;
        consumed = true;
        if (rest.length === 0) break;
        continue;
      }
    }
    break;
  }
  return consumed ? offset : 0;
}

function classifyLine(line: string): MarkdownLineKind {
  if (!line.trim()) return "blank";
  if (getHeadingPrefixLength(line) > 0) return "heading";
  if (/^[ \t]{0,3}>+/.test(line)) return "blockquote";
  if (getStructuralPrefixLength(line) > 0) return "list";
  if (/^[ \t]*!\[\[/.test(line)) return "embed";
  if (/^[ \t]*!\[[^\]\n]*\]\([^)\n]+\)[ \t]*$/.test(line)) return "image";
  if (/^[ \t]*\|.*\|[ \t]*$/.test(line)) return "table";
  if (/^[ \t]*(?:---+|___+|\*\*\*+)[ \t]*$/.test(line)) return "thematic-break";
  return "paragraph";
}

export function getMarkdownLineContexts(
  lines: readonly string[],
): MarkdownLineContext[] {
  const contexts: MarkdownLineContext[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inFrontmatter) {
      contexts.push({ kind: "frontmatter", stronglyProtected: true });
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      continue;
    }
    if (isFenceStart(line)) {
      contexts.push({ kind: "fence", stronglyProtected: true });
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      contexts.push({ kind: "fence", stronglyProtected: true });
      continue;
    }
    contexts.push({ kind: classifyLine(line), stronglyProtected: false });
  }
  return contexts;
}

function findClosingBackticks(text: string, start: number, length: number): number {
  let index = start + length;
  while (index < text.length) {
    const next = text.indexOf("`", index);
    if (next < 0) return -1;
    let run = 1;
    while (next + run < text.length && text[next + run] === "`") run += 1;
    if (run === length) return next + run;
    index = next + run;
  }
  return -1;
}

export function replaceInlineCodeSpans(
  text: string,
  replace: (whole: string, content: string, delimiter: string) => string,
): string {
  let result = "";
  let cursor = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let run = 1;
    while (index + run < text.length && text[index + run] === "`") run += 1;
    const end = findClosingBackticks(text, index, run);
    if (end < 0) break;
    const delimiter = "`".repeat(run);
    result += text.slice(cursor, index);
    result += replace(
      text.slice(index, end),
      text.slice(index + run, end - run),
      delimiter,
    );
    cursor = end;
    index = end;
  }
  return result + text.slice(cursor);
}

function findMatchingBracket(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "[") depth += 1;
    else if (text[index] === "]") {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function findMatchingParen(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function findClosingMarker(text: string, start: number, marker: string): number {
  let index = start + marker.length;
  while (index < text.length) {
    const close = text.indexOf(marker, index);
    if (close < 0) return -1;
    const content = text.slice(start + marker.length, close);
    if (content && content.trim() && !content.includes("\n")) return close;
    index = close + marker.length;
  }
  return -1;
}

function tokenizeInline(text: string, protectSyntax: boolean): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let editableStart = 0;
  const flushEditable = (end: number): void => {
    pushSegment(segments, text.slice(editableStart, end), true);
  };
  let index = 0;

  const consumeProtected = (end: number): void => {
    flushEditable(index);
    pushSegment(segments, text.slice(index, end), false);
    index = end;
    editableStart = index;
  };

  while (index < text.length) {
    // Inline code is always protected, including when protectSyntax is false.
    if (text[index] === "`") {
      let run = 1;
      while (index + run < text.length && text[index + run] === "`") run += 1;
      const end = findClosingBackticks(text, index, run);
      consumeProtected(end < 0 ? text.length : end);
      if (end < 0) break;
      continue;
    }

    // URLs are data, not prose. Protect bare URLs even when syntax protection
    // is disabled; ordinary punctuation/spacing rules must not rewrite them.
    if (text.startsWith("http://", index) || text.startsWith("https://", index)
      || text.startsWith("mailto:", index)) {
      const url = URL_PATTERN.exec(text.slice(index));
      if (url?.index === 0) {
        consumeProtected(index + url[0].length);
        continue;
      }
    }

    if (protectSyntax) {
      const wikiPrefix = text.startsWith("![[", index)
        ? "![["
        : text.startsWith("[[", index) ? "[[" : "";
      if (wikiPrefix) {
        const close = text.indexOf("]]", index + wikiPrefix.length);
        if (close >= 0) {
          const bodyStart = index + wikiPrefix.length;
          const body = text.slice(bodyStart, close);
          const pipe = body.indexOf("|");
          flushEditable(index);
          pushSegment(segments, text.slice(index, bodyStart), false);
          if (pipe < 0) {
            pushSegment(segments, body, false);
          } else {
            pushSegment(segments, body.slice(0, pipe + 1), false);
            const alias = body.slice(pipe + 1);
            const aliasSegments = tokenizeInline(alias, true);
            for (const segment of aliasSegments) pushSegment(segments, segment.text, segment.editable);
          }
          pushSegment(segments, "]]", false);
          index = close + 2;
          editableStart = index;
          continue;
        }
      }

      const imageOrLink = text[index] === "["
        || (text[index] === "!" && text[index + 1] === "[");
      if (imageOrLink) {
        const bracketStart = text[index] === "!" ? index + 1 : index;
        const closeBracket = findMatchingBracket(text, bracketStart);
        if (closeBracket >= 0) {
          const afterBracket = /^\s*\(/.exec(text.slice(closeBracket + 1));
          if (afterBracket) {
            const openParen = closeBracket + 1 + afterBracket[0].length - 1;
            const closeParen = findMatchingParen(text, openParen);
            if (closeParen >= 0) {
              const labelStart = bracketStart + 1;
              const label = text.slice(labelStart, closeBracket);
              flushEditable(index);
              pushSegment(segments, text.slice(index, labelStart), false);
              const labelSegments = tokenizeInline(label, true);
              for (const segment of labelSegments) pushSegment(segments, segment.text, segment.editable);
              pushSegment(segments, text.slice(closeBracket, closeParen + 1), false);
              index = closeParen + 1;
              editableStart = index;
              continue;
            }
          }
        }
      }

      const marker = text.startsWith("**", index) || text.startsWith("__", index)
        ? text.slice(index, index + 2)
        : text.startsWith("~~", index)
          ? "~~"
          : text[index] === "*" || text[index] === "_" ? text[index] : "";
      if (marker) {
        const close = findClosingMarker(text, index, marker);
        const isUnderscoreWord = marker === "_"
          && /[A-Za-z0-9]_|_[A-Za-z0-9]/.test(text.slice(Math.max(0, index - 1), close < 0 ? index + 2 : close + 1));
        if (close > index + marker.length && !isUnderscoreWord) {
          flushEditable(index);
          pushSegment(segments, marker, false);
          const innerSegments = tokenizeInline(
            text.slice(index + marker.length, close),
            true,
          );
          for (const segment of innerSegments) pushSegment(segments, segment.text, segment.editable);
          pushSegment(segments, marker, false);
          index = close + marker.length;
          editableStart = index;
          continue;
        }
      }
    }

    index += 1;
  }
  flushEditable(text.length);
  return segments;
}

export function splitMarkdownLine(
  line: string,
  options: MarkdownProtectionOptions = {},
): MarkdownSegment[] {
  const protectSyntax = options.protectSyntax !== false;
  if (!protectSyntax) return tokenizeInline(line, false);
  const prefixLength = getStructuralPrefixLength(line);
  const segments: MarkdownSegment[] = [];
  if (prefixLength > 0) {
    pushSegment(segments, line.slice(0, prefixLength), false);
    for (const segment of tokenizeInline(line.slice(prefixLength), true)) {
      pushSegment(segments, segment.text, segment.editable);
    }
  } else {
    for (const segment of tokenizeInline(line, true)) {
      pushSegment(segments, segment.text, segment.editable);
    }
  }

  // Two trailing spaces are Markdown's hard-break marker. They are syntax,
  // not disposable whitespace, and remain protected as a unit.
  const last = segments.at(-1);
  if (last?.editable) {
    const match = /[ \t]{2,}$/.exec(last.text);
    if (match) {
      const before = last.text.slice(0, match.index);
      const extra = match[0].slice(0, -2);
      last.text = before;
      if (!last.text) segments.pop();
      pushSegment(segments, extra, true);
      pushSegment(segments, match[0].slice(-2), false);
    }
  }
  return segments;
}

export function transformMarkdownLine(
  line: string,
  transform: (segment: string) => string,
  options: MarkdownProtectionOptions = {},
): string {
  return splitMarkdownLine(line, options)
    .map((segment) => segment.editable ? transform(segment.text) : segment.text)
    .join("");
}

export function transformMarkdownText(
  text: string,
  transform: (segment: string) => string,
  options: MarkdownProtectionOptions = {},
  onlyParagraphs = false,
): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const contexts = getMarkdownLineContexts(lines);
  return lines.map((line, index) => {
    const context = contexts[index];
    if (context.stronglyProtected || (onlyParagraphs && context.kind !== "paragraph")) return line;
    return transformMarkdownLine(line, transform, options);
  }).join(newline);
}

export function isMarkdownUrl(value: string): boolean {
  return HAN_OR_PUNCTUATION.test(value)
    ? false
    : /^(?:https?:\/\/|mailto:)/iu.test(value);
}
