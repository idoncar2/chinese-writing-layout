import {
  getMarkdownLineContexts,
  splitMarkdownLine,
  type MarkdownLineContext,
} from "./markdown-protection";

const PAIRS = [["“", "”"], ["‘", "’"]] as const;
type QuotePair = (typeof PAIRS)[number];

interface QuoteToken {
  line: number;
  offset: number;
  char: string;
  pairIndex: number;
  matched: boolean;
  partner?: QuoteToken;
}

interface QuoteAnalysis {
  contexts: MarkdownLineContext[];
  eligible: boolean[];
  tokens: QuoteToken[][];
}

function isChineseApostrophe(segment: string, index: number, char: string): boolean {
  return char !== "’"
    || !(/[A-Za-z]/u.test(segment[index - 1] ?? "")
      && /[A-Za-z]/u.test(segment[index + 1] ?? ""));
}

function analyzeQuotes(lines: string[]): QuoteAnalysis {
  const contexts = getMarkdownLineContexts(lines);
  const tokens: QuoteToken[][] = lines.map(() => []);
  const stacks: QuoteToken[][] = PAIRS.map(() => []);
  const eligible = lines.map(() => false);

  for (let line = 0; line < lines.length; line += 1) {
    if (contexts[line].stronglyProtected || /^(?: {4}|\t)/u.test(lines[line])) continue;
    const segments = splitMarkdownLine(lines[line]);
    eligible[line] = contexts[line].kind === "paragraph"
      && segments.every((segment) => segment.editable);
    let offset = 0;
    for (const segment of segments) {
      if (segment.editable) {
        for (let index = 0; index < segment.text.length; index += 1) {
          const char = segment.text[index];
          const pairIndex = PAIRS.findIndex(
            ([opening, closing]) => opening === char || closing === char,
          );
          if (pairIndex < 0 || !isChineseApostrophe(segment.text, index, char)) continue;
          const token: QuoteToken = {
            line,
            offset: offset + index,
            char,
            pairIndex,
            matched: false,
          };
          tokens[line].push(token);
          if (char === PAIRS[pairIndex][0]) {
            stacks[pairIndex].push(token);
          } else {
            const opening = stacks[pairIndex].pop();
            if (opening) {
              opening.matched = true;
              opening.partner = token;
              token.matched = true;
              token.partner = opening;
            }
          }
        }
      }
      offset += segment.text.length;
    }
  }

  return { contexts, eligible, tokens };
}

function hasQuoteBefore(text: string, offset: number, opening: string): boolean {
  return text.lastIndexOf(opening, offset - 1) >= 0;
}

function hasQuoteAfter(text: string, offset: number, length: number, closing: string): boolean {
  return text.indexOf(closing, offset + length) >= 0;
}

function normalizeQuoteRun(
  run: string,
  offset: number,
  source: string,
  [opening, closing]: QuotePair,
): string {
  if (run === opening + closing) return run;

  // A closing quote immediately followed by a new opening quote is valid in
  // adjacent quoted phrases. Keep it only when both surrounding pairs exist.
  if (run === closing + opening
    && hasQuoteBefore(source, offset, opening)
    && hasQuoteAfter(source, offset, run.length, closing)) return run;

  if ([...run].every((char) => char === opening)) {
    return opening;
  }
  if ([...run].every((char) => char === closing)) {
    // After an existing opening this is a duplicated closing delimiter;
    // without one, two closing marks are an obvious empty reversed pair.
    return hasQuoteBefore(source, offset, opening) ? closing : opening + closing;
  }

  // Mixed runs of three or more marks (for example “”“ and ““”) cannot form
  // a legal Chinese nesting boundary by themselves. Reduce them to one pair.
  return opening + closing;
}

function normalizeObviousQuoteRuns(lines: string[]): string[] {
  const { eligible } = analyzeQuotes(lines);
  return lines.map((line, index) => {
    if (!eligible[index]) return line;
    let result = line;
    for (const pair of PAIRS) {
      const [opening, closing] = pair;
      const pattern = new RegExp(`[${opening}${closing}]{2,}`, "gu");
      result = result.replace(pattern, (run, offset: number, source: string) =>
        normalizeQuoteRun(run, offset, source, pair));
    }
    return result;
  });
}

function replaceQuotePair(
  text: string,
  first: QuoteToken,
  last: QuoteToken,
  opening: string,
  closing: string,
): string {
  return text.slice(0, first.offset) + opening
    + text.slice(first.offset + 1, last.offset) + closing
    + text.slice(last.offset + 1);
}

function repairDirections(lines: string[], analysis: QuoteAnalysis): string[] {
  return lines.map((text, line) => {
    if (!analysis.eligible[line]) return text;
    let result = text;
    for (const [pairIndex, [opening, closing]] of PAIRS.entries()) {
      const allQuotes = analysis.tokens[line].filter(
        (token) => token.pairIndex === pairIndex,
      );
      if (allQuotes.length === 2) {
        const [first, last] = allQuotes;
        const body = text.slice(first.offset + 1, last.offset);
        const sameDirection = first.char === last.char;
        const reversed = first.char === closing && last.char === opening;
        const bridgesMultilineQuote = reversed
          && first.partner !== undefined
          && last.partner !== undefined
          && first.partner.line < line
          && last.partner.line > line;
        // A reversed local pair remains valid only when its closing side really
        // pairs with an earlier line and its opening side with a later line.
        // This distinguishes `”旁白“` inside a multiline quotation from a list
        // of independent samples written on consecutive lines.
        if (/\p{Script=Han}/u.test(body)
          && (sameDirection || (reversed && !bridgesMultilineQuote))) {
          result = replaceQuotePair(result, first, last, opening, closing);
          continue;
        }
      }

      const quotes = analysis.tokens[line].filter(
        (token) => token.pairIndex === pairIndex && !token.matched,
      );
      if (quotes.length !== 2) continue;
      const [first, last] = quotes;
      const body = text.slice(first.offset + 1, last.offset);
      if (!/\p{Script=Han}/u.test(body)) continue;
      result = replaceQuotePair(result, first, last, opening, closing);
    }
    return result;
  });
}

function completeByParagraph(lines: string[], analysis: QuoteAnalysis): string[] {
  const result = [...lines];
  for (let start = 0; start < lines.length; start += 1) {
    if (analysis.contexts[start].kind !== "paragraph"
      || analysis.contexts[start].stronglyProtected) continue;
    let end = start;
    while (end + 1 < lines.length
      && analysis.contexts[end + 1].kind === "paragraph"
      && !analysis.contexts[end + 1].stronglyProtected) end += 1;
    const quotes = analysis.tokens.slice(start, end + 1).flat();
    if (analysis.eligible.slice(start, end + 1).every(Boolean)
      && quotes.length === 1
      && !quotes[0].matched
      && /\p{Script=Han}/u.test(lines.slice(start, end + 1).join("\n"))) {
      const quote = quotes[0];
      const [opening, closing] = PAIRS[quote.pairIndex];
      if (quote.char === opening) {
        result[end] = result[end].replace(/\s*$/u, (tail) => closing + tail);
      } else {
        result[start] = result[start].replace(/^\s*/u, (head) => head + opening);
      }
    }
    start = end;
  }
  return result;
}

function completeConservatively(lines: string[], analysis: QuoteAnalysis): string[] {
  return lines.map((text, line) => {
    if (!analysis.eligible[line]) return text;
    const quotes = analysis.tokens[line];
    if (quotes.length !== 1 || quotes[0].matched) return text;
    const quote = quotes[0];
    const [opening, closing] = PAIRS[quote.pairIndex];
    // Require an explicit speech boundary and exactly one sentence. Never
    // infer missing quote positions from arbitrary paragraph boundaries.
    const match = /^([^：:“”‘’。！？\n]+：)([“‘]?)([^“”‘’。！？：\n]+[。！？])([”’]?)(\s*)$/u.exec(text);
    if (!match || !/\p{Script=Han}/u.test(match[3])) return text;
    if (match[2] === opening && !match[4]) {
      return `${match[1]}${opening}${match[3]}${closing}${match[5]}`;
    }
    if (!match[2] && match[4] === closing) {
      return `${match[1]}${opening}${match[3]}${closing}${match[5]}`;
    }
    return text;
  });
}

/**
 * Repair existing directions or complete one missing side using the same
 * document-level Markdown-aware quote analysis.
 */
export function repairChineseQuotes(
  lines: string[],
  complete: boolean | "paragraph",
): string[] {
  if (complete === false) {
    const normalized = normalizeObviousQuoteRuns(lines);
    return repairDirections(normalized, analyzeQuotes(normalized));
  }

  const analysis = analyzeQuotes(lines);
  return complete === "paragraph"
    ? completeByParagraph(lines, analysis)
    : completeConservatively(lines, analysis);
}
