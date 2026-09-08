import {
  getMarkdownLineContexts,
  transformMarkdownText,
} from "./markdown-protection";
import { repairChineseQuotes } from "./quote-repair";
import { normalizeChapterHeadingLine } from "./chapter-heading-format";
import type {
  BuiltinFormattingPresetId,
  ChapterHeadingFormat,
  FormattingRuleKey,
  FormattingRules,
} from "./types";
import {
  DEFAULT_FORMATTING_RULE_ORDER,
  DEFAULT_FORMATTING_RULES,
} from "./types";

export interface FormattingRuleDefinition {
  key: FormattingRuleKey;
  label: string;
  description: string;
}

export interface FormattingRuleGroup {
  label: string;
  keys: FormattingRuleKey[];
}

export const FORMATTING_RULES: FormattingRuleDefinition[] = [
  { key: "repairQuoteDirections", label: "修复中文引号方向", description: "修复边界明确的反向双引号、单引号；跨段或复杂配对保留提示。" },
  { key: "completeMissingQuotes", label: "保守补全", description: "仅补全有中文冒号、且只有一句完整对白的单边引号；跨段已配对、多句或嵌套引语不处理。与宽松补全互斥。" },
  { key: "completeMissingQuotesByParagraph", label: "按段落补全（宽松）", description: "不要求冒号，允许多句；段落只有一个未配对引号时，缺左补段首、缺右补段尾。空行或结构变化分隔段落；全文已配对、代码及复杂嵌套不处理。可能把叙述文字纳入引号，请检查结果。与保守补全互斥。" },
  { key: "normalizeRepeatedPunctuation", label: "整理重复标点", description: "合并重复逗号等；连续三个以上问号或叹号保留两个。保留省略号、破折号及混合问叹号。" },
  { key: "trimLeadingWhitespace", label: "去掉行首空白字符", description: "清理正文行首的半角空格、全角空格和制表符。" },
  { key: "trimTrailingWhitespace", label: "去掉行尾空白字符", description: "清理每行末尾不可见的空格和制表符。" },
  { key: "trimDocumentBlankLines", label: "去掉文首与文末空行", description: "删除整篇正文最前面和最后面的多余空行。" },
  { key: "collapseBlankLines", label: "合并多个连续空行", description: "连续空行最多保留一个。" },
  { key: "ensureBlankLineBetweenParagraphs", label: "确保段落之间有一个空行", description: "在相邻正文段之间插入空行，不处理列表、标题和代码。" },
  { key: "ensureBlankLineAfterHeadings", label: "章节标题和正文之间空一行", description: "在 Markdown 标题后紧接正文时插入一个空行；不处理连续标题、列表、引用和代码。" },
  { key: "normalizeChapterHeadingFormat", label: "统一章节标题格式", description: "统一 Markdown 标题开头的章节编号，并保留后续标题文字。" },
  { key: "removeAllBlankLines", label: "移除所有正文空行", description: "生成紧凑正文；不会删除 YAML 和代码块内部的空行。" },
  { key: "collapseRepeatedSpaces", label: "合并多个连续空格", description: "正文中的连续空格合并为一个。" },
  { key: "removeSpacesBetweenChinese", label: "移除中文字符之间的空格", description: "例如“这 是 正文”和“你好 ，世界”会被正确合并。" },
  { key: "addSpacesBetweenChineseAndLatin", label: "在中文与英文数字之间加空格", description: "例如“使用Obsidian写作”会变为“使用 Obsidian 写作”。" },
  { key: "removeSpacesBetweenChineseAndLatin", label: "移除中文与英文数字之间的空格", description: "例如“使用 Obsidian 写作”会变为“使用Obsidian写作”。" },
  { key: "removeAllSpaces", label: "移除正文中的所有空格", description: "只处理正文，代码、YAML 和行内代码保持原样。" },
  { key: "addManualIndentation", label: "段首加入 2 个全角空格", description: "将正文段首统一为两个全角空格，适合不支持视觉缩进的投稿平台。" },
  { key: "removeManualIndentation", label: "移除手工段首空格", description: "写作模式已有视觉缩进，正文中无需保留段首空格。" },
  { key: "convertHalfwidthPunctuation", label: "常用半角标点转为全角", description: "仅转换紧邻中文的逗号、句号、问号、叹号、冒号和分号。" },
  { key: "convertFullwidthPunctuation", label: "常用全角标点转为半角", description: "将中文全角逗号、句号、问号等转换为半角形式。" },
  { key: "normalizeStraightQuotes", label: "英文直引号 → 中文弯引号", description: "例如：\"文字\" → “文字”，'文字' → ‘文字’；不处理「」『』。" },
  { key: "convertCurlyQuotesToCorner", label: "中文弯引号转直角引号", description: "将“”‘’转换为「」『』。" },
  { key: "convertCornerQuotesToCurly", label: "直角引号 → 中文弯引号", description: "例如：「文字」→“文字”，『文字』→‘文字’；不处理英文直引号。" },
  { key: "normalizeEllipsis", label: "省略号规范化", description: "将三个以上连续句点或省略号统一为“……”。" },
];

export const FORMATTING_RULE_GROUPS: FormattingRuleGroup[] = [
  {
    label: "空白",
    keys: ["trimLeadingWhitespace", "trimTrailingWhitespace", "trimDocumentBlankLines"],
  },
  {
    label: "空行",
    keys: ["collapseBlankLines", "ensureBlankLineBetweenParagraphs", "ensureBlankLineAfterHeadings", "removeAllBlankLines"],
  },
  {
    label: "空格",
    keys: [
      "collapseRepeatedSpaces",
      "removeSpacesBetweenChinese",
      "addSpacesBetweenChineseAndLatin",
      "removeSpacesBetweenChineseAndLatin",
      "removeAllSpaces",
    ],
  },
  {
    label: "标题",
    keys: ["normalizeChapterHeadingFormat"],
  },
  {
    label: "段首",
    keys: ["addManualIndentation", "removeManualIndentation"],
  },
  {
    label: "标点",
    keys: ["convertHalfwidthPunctuation", "convertFullwidthPunctuation", "normalizeEllipsis", "normalizeRepeatedPunctuation"],
  },
  {
    label: "引号",
    keys: [
      "normalizeStraightQuotes",
      "repairQuoteDirections",
      "completeMissingQuotes",
      "completeMissingQuotesByParagraph",
      "convertCurlyQuotesToCorner",
      "convertCornerQuotesToCurly",
    ],
  },
];

export function createDisabledFormattingRules(): FormattingRules {
  return Object.fromEntries(
    DEFAULT_FORMATTING_RULE_ORDER.map((key) => [key, false]),
  ) as unknown as FormattingRules;
}

export const FORMATTING_PRESETS: Record<
  BuiltinFormattingPresetId,
  { label: string; rules: FormattingRules }
> = {
  novel: { label: "小说整洁（推荐）", rules: { ...DEFAULT_FORMATTING_RULES } },
  compact: {
    label: "紧凑正文",
    rules: {
      ...DEFAULT_FORMATTING_RULES,
      collapseBlankLines: false,
      ensureBlankLineBetweenParagraphs: false,
      removeAllBlankLines: true,
    },
  },
  punctuation: {
    label: "中文标点整理",
    rules: {
      ...createDisabledFormattingRules(),
      trimTrailingWhitespace: true,
      collapseRepeatedSpaces: true,
      removeSpacesBetweenChinese: true,
      convertHalfwidthPunctuation: true,
      normalizeStraightQuotes: true,
      repairQuoteDirections: true,
      normalizeEllipsis: true,
    },
  },
};

const HAN = "\\p{Script=Han}";
const CJK_FULLWIDTH = `${HAN}，。！？；：、：“”‘’（）《》【】「」『』`;
const HAN_CHARACTER = new RegExp(HAN, "u");
const LEADING_PROSE_WHITESPACE = /^[\t \u00a0\u2000-\u200a\u202f\u3000]+/u;
const OPTIONAL_LEADING_PROSE_WHITESPACE = /^[\t \u00a0\u2000-\u200a\u202f\u3000]*/u;
const HALF_WIDTH_PUNCTUATION: Record<string, string> = {
  ",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；",
};
const FULL_WIDTH_PUNCTUATION: Record<string, string> = Object.fromEntries(
  Object.entries(HALF_WIDTH_PUNCTUATION).map(([half, full]) => [full, half]),
);

function transformEditableLines(
  lines: string[],
  transform: (segment: string) => string,
  protectSyntax: boolean,
): string[] {
  return transformMarkdownText(lines.join("\n"), transform, { protectSyntax })
    .split("\n");
}

function transformParagraphLines(
  lines: string[],
  transform: (line: string) => string,
): string[] {
  const contexts = getMarkdownLineContexts(lines);
  return lines.map((line, index) =>
    contexts[index].kind === "paragraph" && !contexts[index].stronglyProtected
      ? transform(line)
      : line,
  );
}

function applyRule(
  lines: string[],
  key: FormattingRuleKey,
  protectSyntax: boolean,
  chapterHeadingFormat: ChapterHeadingFormat,
): string[] {
  const contexts = getMarkdownLineContexts(lines);
  const protectedLines = contexts.map((context) => context.stronglyProtected);
  switch (key) {
    case "trimLeadingWhitespace":
      return transformParagraphLines(lines, (line) => line.replace(LEADING_PROSE_WHITESPACE, ""));
    case "trimTrailingWhitespace":
      return lines.map((line, index) => {
        if (protectedLines[index]) return line;
        if (protectSyntax && / {2,}$/u.test(line)) {
          return line.replace(/[ \t　]+$/u, "  ");
        }
        return line.replace(/[ \t　]+$/u, "");
      });
    case "trimDocumentBlankLines": {
      let start = 0;
      let end = lines.length;
      while (start < end && !protectedLines[start] && lines[start].trim() === "") start += 1;
      while (end > start && !protectedLines[end - 1] && lines[end - 1].trim() === "") end -= 1;
      return lines.slice(start, end);
    }
    case "removeAllBlankLines":
      return lines.filter((line, index) => protectedLines[index] || line.trim().length > 0);
    case "collapseBlankLines": {
      const collapsed: string[] = [];
      let previousWasBlank = false;
      for (let index = 0; index < lines.length; index += 1) {
        const blank = !protectedLines[index] && lines[index].trim() === "";
        if (blank && previousWasBlank) continue;
        collapsed.push(lines[index]);
        previousWasBlank = blank;
      }
      return collapsed;
    }
    case "ensureBlankLineBetweenParagraphs": {
      const spaced: string[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        spaced.push(line);
        const nextLine = lines[index + 1];
        if (
          nextLine !== undefined && !protectedLines[index] && !protectedLines[index + 1] &&
          contexts[index].kind === "paragraph" && contexts[index + 1].kind === "paragraph"
        ) spaced.push("");
      }
      return spaced;
    }
    case "ensureBlankLineAfterHeadings": {
      const spaced: string[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        spaced.push(lines[index]);
        if (
          contexts[index].kind === "heading"
          && contexts[index + 1]?.kind === "paragraph"
        ) spaced.push("");
      }
      return spaced;
    }
    case "normalizeChapterHeadingFormat":
      return lines.map((line, index) => contexts[index].kind === "heading"
        ? normalizeChapterHeadingLine(line, chapterHeadingFormat)
        : line);
    case "collapseRepeatedSpaces":
      return transformEditableLines(lines, (segment) => segment.replace(/[ \t　]{2,}/gu, " "), protectSyntax);
    case "removeSpacesBetweenChinese":
      return transformEditableLines(lines, (segment) => segment.replace(
        new RegExp(`(?<=[${CJK_FULLWIDTH}])[ \\t　]+(?=[${CJK_FULLWIDTH}])`, "gu"), "",
      ), protectSyntax);
    case "addSpacesBetweenChineseAndLatin":
      return transformEditableLines(lines, (segment) => segment
        .replace(new RegExp(`(?<=[${HAN}])(?=[A-Za-z0-9])`, "gu"), " ")
        .replace(new RegExp(`(?<=[A-Za-z0-9])(?=[${HAN}])`, "gu"), " "), protectSyntax);
    case "removeSpacesBetweenChineseAndLatin":
      return transformEditableLines(lines, (segment) => segment
        .replace(new RegExp(`(?<=[${HAN}])[ \\t　]+(?=[A-Za-z0-9])`, "gu"), "")
        .replace(new RegExp(`(?<=[A-Za-z0-9])[ \\t　]+(?=[${HAN}])`, "gu"), ""), protectSyntax);
    case "removeAllSpaces":
      return transformEditableLines(lines, (segment) => segment.replace(/[ \t　]+/gu, ""), protectSyntax);
    case "addManualIndentation":
      return transformParagraphLines(
        lines,
        (line) => line.replace(OPTIONAL_LEADING_PROSE_WHITESPACE, "　　"),
      );
    case "removeManualIndentation":
      return transformParagraphLines(lines, (line) => line.replace(LEADING_PROSE_WHITESPACE, ""));
    case "convertHalfwidthPunctuation":
      return transformEditableLines(lines, (segment) => segment.replace(
        /[,.?!:;]/g,
        (character, offset: number, source: string) => {
          const before = source[offset - 1] ?? "";
          const after = source[offset + 1] ?? "";
          return HAN_CHARACTER.test(before) || HAN_CHARACTER.test(after)
            ? HALF_WIDTH_PUNCTUATION[character] : character;
        },
      ), protectSyntax);
    case "convertFullwidthPunctuation":
      return transformEditableLines(lines, (segment) => segment.replace(
        /[，。？！：；]/g, (character) => FULL_WIDTH_PUNCTUATION[character],
      ), protectSyntax);
    case "normalizeStraightQuotes":
      return transformEditableLines(lines, (segment) => segment
        .replace(/"([^"\n]+)"/g, "“$1”")
        .replace(/'([^'\n]+)'/g, "‘$1’"), protectSyntax);
    case "repairQuoteDirections":
      return repairChineseQuotes(lines, false);
    case "completeMissingQuotes":
      return repairChineseQuotes(lines, true);
    case "completeMissingQuotesByParagraph":
      return repairChineseQuotes(lines, "paragraph");
    case "normalizeRepeatedPunctuation":
      return transformEditableLines(lines, (segment) => segment
        .replace(/([，；：、])\1+/gu, "$1")
        .replace(/。+/gu, (run) => run.length === 2 ? "。" : run)
        .replace(/([！？])\1{2,}/gu, "$1$1"), protectSyntax);
    case "convertCurlyQuotesToCorner":
      return transformEditableLines(lines, (segment) => segment.replace(
        /[“”‘’]/g,
        (character) => ({ "“": "「", "”": "」", "‘": "『", "’": "』" })[character] ?? character,
      ), protectSyntax);
    case "convertCornerQuotesToCurly":
      return transformEditableLines(lines, (segment) => segment.replace(
        /[「」『』]/g,
        (character) => ({ "「": "“", "」": "”", "『": "‘", "』": "’" })[character] ?? character,
      ), protectSyntax);
    case "normalizeEllipsis":
      return transformEditableLines(lines, (segment) => segment.replace(/(?:\.{3,}|。{3,}|…{3,})/g, "……"), protectSyntax);
  }
}

export function normalizeRuleOrder(order: readonly FormattingRuleKey[] | undefined): FormattingRuleKey[] {
  const known = new Set(DEFAULT_FORMATTING_RULE_ORDER);
  const normalized = (order ?? []).filter(
    (key, index, values) => known.has(key) && values.indexOf(key) === index,
  );
  for (const key of DEFAULT_FORMATTING_RULE_ORDER) {
    if (!normalized.includes(key)) normalized.push(key);
  }
  return normalized;
}

export function applyFormattingRules(
  text: string,
  rules: FormattingRules,
  order: readonly FormattingRuleKey[] = DEFAULT_FORMATTING_RULE_ORDER,
  markdownFormatting?: {
    protectSyntax?: boolean;
    mode?: unknown;
    repair?: unknown;
    chapterHeadingFormat?: ChapterHeadingFormat;
  },
): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const protectSyntax = markdownFormatting?.protectSyntax !== false;
  const chapterHeadingFormat = markdownFormatting?.chapterHeadingFormat ?? "arabic-unit";
  let lines = text.split(/\r?\n/);
  for (const key of normalizeRuleOrder(order)) {
    // Malformed/imported settings cannot enable the more aggressive mode
    // alongside conservative completion, regardless of execution order.
    if (key === "completeMissingQuotesByParagraph" && rules.completeMissingQuotes) continue;
    if (rules[key]) lines = applyRule(lines, key, protectSyntax, chapterHeadingFormat);
  }
  return lines.join(newline);
}
