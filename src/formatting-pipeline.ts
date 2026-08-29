import { applyFormattingRules } from "./formatting";
import { applyMarkdownFormatting } from "./markdown-formatting";
import { normalizeMarkdownFormattingOptions } from "./types";
import type {
  FormattingRuleKey,
  FormattingRules,
  MarkdownFormattingOptions,
} from "./types";

/**
 * The one pure formatting path shared by single-note and batch formatting.
 * Markdown is repaired before ordinary rules, syntax is re-identified by the
 * protection layer for every rule, and stripping is deliberately last.
 */
export function applyFormattingPipeline(
  text: string,
  rules: FormattingRules,
  order: readonly FormattingRuleKey[],
  markdownFormatting: MarkdownFormattingOptions,
): string {
  const normalized = normalizeMarkdownFormattingOptions(markdownFormatting);
  let result = text;
  if (normalized.mode === "repair") {
    result = applyMarkdownFormatting(result, normalized);
  }
  result = applyFormattingRules(result, rules, order, normalized);
  if (normalized.mode === "strip") {
    result = applyMarkdownFormatting(result, normalized);
  }
  return result;
}

export const formatTextWithOptions = applyFormattingPipeline;
