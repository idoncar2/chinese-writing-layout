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

export function countWritingCharacters(text: string): number {
  const withoutFrontmatter = text.replace(
    /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
    "",
  );
  return withoutFrontmatter.replace(/\s/gu, "").length;
}

export function isProseLine(text: string, inFence: boolean): boolean {
  const trimmed = text.trim();
  if (!trimmed || inFence) return false;
  return !/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|.*\||---+$|___+$|\*\*\*+$|!\[\[|```dataview)/.test(
    trimmed,
  );
}
