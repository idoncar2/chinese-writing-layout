import type { CountMode } from "./types";

export type DiagnosticKind =
  | "halfwidth-punctuation"
  | "repeated-punctuation"
  | "unmatched-pair"
  | "raw-indentation";

export interface TextDiagnostic {
  from: number;
  to: number;
  kind: DiagnosticKind;
  message: string;
}

interface TextRange {
  from: number;
  to: number;
}

const HAN = /\p{Script=Han}/u;
const LATIN = /^\p{Script=Latin}$/u;
const DECIMAL_NUMBER = /^\p{Decimal_Number}$/u;
const MARK = /^\p{M}$/u;

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function excludedMarkdownRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];

  if (text.startsWith("---\n") || text.startsWith("---\r\n")) {
    const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
    if (match) ranges.push({ from: 0, to: match[0].length });
  }

  const fencedCode = /^(```+|~~~+).*$(?:\r?\n[\s\S]*?^\1\s*$)?/gm;
  for (const match of text.matchAll(fencedCode)) {
    const from = match.index ?? 0;
    ranges.push({ from, to: from + match[0].length });
  }

  const inlineCode = /`+[^`\n]+`+/g;
  for (const match of text.matchAll(inlineCode)) {
    const from = match.index ?? 0;
    ranges.push({ from, to: from + match[0].length });
  }

  return mergeRanges(ranges);
}

function isExcluded(offset: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

function addRegexDiagnostics(
  text: string,
  expression: RegExp,
  excluded: TextRange[],
  kind: DiagnosticKind,
  message: string,
  diagnostics: TextDiagnostic[],
): void {
  for (const match of text.matchAll(expression)) {
    const from = match.index ?? 0;
    if (isExcluded(from, excluded)) continue;
    diagnostics.push({
      from,
      to: from + Math.max(match[0].length, 1),
      kind,
      message,
    });
  }
}

function addUnmatchedPairs(
  text: string,
  excluded: TextRange[],
  diagnostics: TextDiagnostic[],
): void {
  const pairs: Array<[string, string]> = [
    ["“", "”"],
    ["‘", "’"],
    ["《", "》"],
  ];

  for (const [opening, closing] of pairs) {
    const stack: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      if (isExcluded(index, excluded)) continue;
      const character = text[index];
      if (character === opening) {
        stack.push(index);
      } else if (character === closing) {
        const openingIndex = stack.pop();
        if (openingIndex === undefined) {
          diagnostics.push({
            from: index,
            to: index + 1,
            kind: "unmatched-pair",
            message: `没有找到与“${closing}”对应的“${opening}”`,
          });
        }
      }
    }

    for (const index of stack) {
      diagnostics.push({
        from: index,
        to: index + 1,
        kind: "unmatched-pair",
        message: `没有找到与“${opening}”对应的“${closing}”`,
      });
    }
  }
}

export function analyzeChineseText(text: string): TextDiagnostic[] {
  const diagnostics: TextDiagnostic[] = [];
  const excluded = excludedMarkdownRanges(text);

  const halfwidthPunctuation = /[!?;:,\.]/g;
  for (const match of text.matchAll(halfwidthPunctuation)) {
    const from = match.index ?? 0;
    if (isExcluded(from, excluded)) continue;
    const previous = text[from - 1] ?? "";
    const next = text[from + 1] ?? "";
    if (HAN.test(previous) || HAN.test(next)) {
      diagnostics.push({
        from,
        to: from + 1,
        kind: "halfwidth-punctuation",
        message: "中文语境中可能误用了半角标点",
      });
    }
  }

  addRegexDiagnostics(
    text,
    /([，。；：、])\1+|([！？])\2{2,}/g,
    excluded,
    "repeated-punctuation",
    "这里可能出现了重复标点",
    diagnostics,
  );

  const lineExpression = /^( {2,}|\t+|　+)(?=\S)/gm;
  for (const match of text.matchAll(lineExpression)) {
    const from = match.index ?? 0;
    if (isExcluded(from, excluded)) continue;
    const lineEnd = text.indexOf("\n", from);
    const line = text.slice(from, lineEnd === -1 ? text.length : lineEnd);
    if (/^\s*(?:[-*+] |\d+[.)] |> |#{1,6} |\|)/.test(line)) continue;
    diagnostics.push({
      from,
      to: from + match[0].length,
      kind: "raw-indentation",
      message: "段首包含手工空格；写作模式已经提供视觉缩进",
    });
  }

  addUnmatchedPairs(text, excluded, diagnostics);

  return diagnostics.sort((a, b) => a.from - b.from || a.to - b.to);
}

export function countCreativeWords(text: string): number {
  const visible = visibleMarkdownText(stripYamlFrontMatter(text));
  const codePoints = Array.from(visible);
  let count = 0;
  let index = 0;

  while (index < codePoints.length) {
    const character = codePoints[index] ?? "";
    if (HAN.test(character)) {
      count += 1;
      index += 1;
    } else if (LATIN.test(character)) {
      count += 1;
      index = consumeLatinWord(codePoints, index);
    } else if (DECIMAL_NUMBER.test(character)) {
      count += 1;
      index = consumeNumber(codePoints, index);
    } else {
      index += 1;
    }
  }

  return count;
}

export function countBodyCharacters(text: string): number {
  return Array.from(stripYamlFrontMatter(text))
    .filter((character) => !/^\s$/u.test(character))
    .length;
}

export function countWritingText(text: string, mode: CountMode): number {
  return mode === "body-characters"
    ? countBodyCharacters(text)
    : countCreativeWords(text);
}

function stripYamlFrontMatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  const firstLine = (lines[0] ?? "").replace(/^\uFEFF/u, "");
  if (!/^\s*---\s*$/u.test(firstLine)) return markdown;

  for (let index = 1; index < lines.length; index += 1) {
    if (/^\s*(?:---|\.\.\.)\s*$/u.test(lines[index] ?? "")) {
      return lines.slice(index + 1).join("\n");
    }
  }
  return markdown;
}

function visibleMarkdownText(markdown: string): string {
  let text = removeFencedCode(markdown);
  text = text.replace(/<!--[\s\S]*?-->/gu, "\n");
  text = text.replace(/%%[\s\S]*?%%/gu, "\n");
  text = text.replace(/!\[\[[^\]\n]*\]\]/gu, "\n");
  text = text.replace(/!\[[^\]\n]*\]\([^\n]*?\)/gu, "\n");
  text = text.replace(/!\[[^\]\n]*\]\[[^\]\n]*\]/gu, "\n");
  text = text.replace(/<img\b[^>]*>/giu, "\n");
  text = text.replace(/`+[^`\n]*`+/gu, "\n");
  text = text.replace(/^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*$/gmu, "");
  text = text.replace(/\[\[[^\]|\n]+\|([^\]\n]+)\]\]/gu, "$1");
  text = text.replace(/\[\[([^\]|\n]+)\]\]/gu, "$1");
  text = text.replace(/\[([^\]\n]*)\]\([^\n]*?\)/gu, "$1");
  text = text.replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/gu, "$1");
  text = text.replace(/<[^>\n]+>/gu, "\n");
  text = text.replace(/\^[A-Za-z0-9][A-Za-z0-9_-]*/gu, "\n");
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>])/gu, "$1");
  text = text.replace(/(^|\n)[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/gu, "$1");
  text = text.replace(/(?:\*\*|__|~~)/gu, "");
  text = text.replace(/(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w)/gu, "");
  return text.replace(/[\[\]]/gu, "");
}

function removeFencedCode(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  let fenceCharacter: "`" | "~" | undefined;
  const visible: string[] = [];

  for (const line of lines) {
    const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceCharacter === undefined) {
      if (opening !== null) {
        fenceCharacter = opening[1]?.startsWith("~") ? "~" : "`";
        visible.push("");
      } else {
        visible.push(line);
      }
      continue;
    }
    if (new RegExp(`^ {0,3}${fenceCharacter}{3,}`).test(line)) {
      fenceCharacter = undefined;
    }
    visible.push("");
  }

  return visible.map((line) => /^(?: {4}|\t)/u.test(line) ? "" : line).join("\n");
}

function consumeLatinWord(codePoints: string[], start: number): number {
  let index = start;
  while (index < codePoints.length) {
    if (LATIN.test(codePoints[index] ?? "")) {
      index += 1;
      continue;
    }
    if (MARK.test(codePoints[index] ?? "") && index > start) {
      index += 1;
      continue;
    }
    const apostrophe = codePoints[index] === "'" || codePoints[index] === "’";
    if (apostrophe && LATIN.test(codePoints[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function consumeNumber(codePoints: string[], start: number): number {
  let index = start;
  while (DECIMAL_NUMBER.test(codePoints[index] ?? "")) index += 1;
  return index;
}

export function isProseLine(text: string, inFence: boolean): boolean {
  const trimmed = text.trim();
  if (!trimmed || inFence) return false;
  return !/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|.*\||---+$|___+$|\*\*\*+$|!\[\[|```dataview)/.test(
    trimmed,
  );
}
