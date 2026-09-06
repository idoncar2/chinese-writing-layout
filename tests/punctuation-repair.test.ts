import { describe, expect, it } from "vitest";
import { applyFormattingRules, createDisabledFormattingRules, FORMATTING_RULES, FORMATTING_RULE_GROUPS } from "../src/formatting";
import { DEFAULT_FORMATTING_RULES, type FormattingRuleKey } from "../src/types";
import { DEFAULT_FORMATTING_RULE_ORDER, DEFAULT_MARKDOWN_FORMATTING_OPTIONS } from "../src/types";
import { applyFormattingPipeline } from "../src/formatting-pipeline";

function format(text: string, ...keys: FormattingRuleKey[]): string {
  const rules = createDisabledFormattingRules();
  for (const key of keys) rules[key] = true;
  return applyFormattingRules(text, rules);
}

describe("conservative punctuation repair", () => {
  it("optionally completes paragraph boundaries without a colon or single sentence limit", () => {
    expect(format('“你好。明天见。', 'completeMissingQuotesByParagraph')).toBe('“你好。明天见。”');
    expect(format('你好。明天见。”', 'completeMissingQuotesByParagraph')).toBe('“你好。明天见。”');
    expect(format('‘你好', 'completeMissingQuotesByParagraph')).toBe('‘你好’');
  });
  it("treats soft line breaks as one paragraph and preserves CRLF and indentation", () => {
    expect(format('　“你好。\r\n明天见。\r\n\r\n别的段落。', 'completeMissingQuotesByParagraph'))
      .toBe('　“你好。\r\n明天见。”\r\n\r\n别的段落。');
  });
  it("keeps matched cross-paragraph quotations and ambiguous nested content", () => {
    for (const input of ['“第一段。\n\n第二段。”', '他说：“她说‘你好’。', '```\n“你好\n```', '“你好 `code`。', '---\ntitle: “你好\n---']) {
      expect(format(input, 'completeMissingQuotesByParagraph')).toBe(input);
    }
  });
  it("keeps both completion modes off by default and falls back to conservative on conflicting data", () => {
    expect(DEFAULT_FORMATTING_RULES.completeMissingQuotes).toBe(false);
    expect(DEFAULT_FORMATTING_RULES.completeMissingQuotesByParagraph).toBe(false);
    expect(format('“你好。明天见。', 'completeMissingQuotes', 'completeMissingQuotesByParagraph')).toBe('“你好。明天见。');
  });
  it("clearly distinguishes straight English quotes from corner quotes", () => {
    expect(FORMATTING_RULES.find(rule => rule.key === 'normalizeStraightQuotes')?.label).toBe('英文直引号 → 中文弯引号');
    expect(FORMATTING_RULES.find(rule => rule.key === 'convertCornerQuotesToCurly')?.label).toBe('直角引号 → 中文弯引号');
    expect(format('「文字」', 'normalizeStraightQuotes')).toBe('「文字」');
    expect(format('"文字"', 'normalizeStraightQuotes')).toBe('“文字”');
    expect(format('「文字」', 'convertCornerQuotesToCurly')).toBe('“文字”');
  });
  it("repairs the actual quotation inside a full prose paragraph", () => {
    const input = '天上风筝渐渐多了，地上孩子也多了。城里乡下，家家户户，老老小小，他们也赶趟儿似的，一个个都出来了。舒活舒活筋骨，抖擞抖擞精神，各做各的一份儿事去。“一年之计在於春“，刚起头儿，有的是工夫，有的是希望。';
    const expected = input.replace('在於春“', '在於春”');
    expect(format(input, 'repairQuoteDirections')).toBe(expected);
    expect(format(expected, 'repairQuoteDirections')).toBe(expected);
    expect(applyFormattingPipeline(input, { ...createDisabledFormattingRules(),
      normalizeStraightQuotes: true, repairQuoteDirections: true, completeMissingQuotes: true,
    }, DEFAULT_FORMATTING_RULE_ORDER, DEFAULT_MARKDOWN_FORMATTING_OPTIONS)).toBe(expected);
  });
  it("repairs a single unambiguous quotation after prose without a colon", () => {
    expect(format('人们常说“一年之计在於春“，确实如此。', 'repairQuoteDirections'))
      .toBe('人们常说“一年之计在於春”，确实如此。');
    expect(format('他提到‘早起‘，我点点头。', 'repairQuoteDirections'))
      .toBe('他提到‘早起’，我点点头。');
  });
  it("repairs the reported quote without changing its traditional character", () => {
    expect(format('“一年之计在於春“', 'repairQuoteDirections')).toBe('“一年之计在於春”');
  });
  it("repairs quote direction when followed by punctuation and narration", () => {
    for (const suffix of ['，', '。', '，他这样说道。', '！', '；', '？']) {
      expect(format(`“一年之计在於春“${suffix}`, 'repairQuoteDirections')).toBe(`“一年之计在於春”${suffix}`);
      expect(format(`‘一年之计在於春‘${suffix}`, 'repairQuoteDirections')).toBe(`‘一年之计在於春’${suffix}`);
    }
  });
  it("repairs reversed curly quote directions", () => {
    expect(format('”你好。“', 'repairQuoteDirections')).toBe('“你好。”');
    expect(format('他说：’你好。‘', 'repairQuoteDirections')).toBe('他说：‘你好。’');
    expect(format('“你好。“', 'repairQuoteDirections')).toBe('“你好。”');
    expect(format('”你好。”', 'repairQuoteDirections')).toBe('“你好。”');
  });
  it("repairs obvious runs of two or three Chinese double quotes", () => {
    const cases = new Map([
      ['““文字”', '“文字”'],
      ['“文字””', '“文字”'],
      ['“”“', '“”'],
      ['““”', '“”'],
      ['””', '“”'],
    ]);
    for (const [input, expected] of cases) {
      expect(format(input, 'repairQuoteDirections'), input).toBe(expected);
      expect(format(expected, 'repairQuoteDirections'), `idempotent: ${input}`).toBe(expected);
    }
  });
  it("repairs obvious runs of two or three Chinese single quotes", () => {
    const cases = new Map([
      ['‘‘文字’', '‘文字’'],
      ['‘文字’’', '‘文字’'],
      ['‘’‘', '‘’'],
      ['‘‘’', '‘’'],
      ['’’', '‘’'],
    ]);
    for (const [input, expected] of cases) {
      expect(format(input, 'repairQuoteDirections'), input).toBe(expected);
    }
  });
  it("keeps valid nested and adjacent quotations while repairing their outer context", () => {
    for (const input of [
      '“他说：‘你好。’”',
      '“甲”‘乙’',
      '“甲”“乙”',
      '他说：“甲。”她答：‘乙。’',
    ]) {
      expect(format(input, 'repairQuoteDirections')).toBe(input);
    }
    expect(format('”他说：‘你好。’“', 'repairQuoteDirections')).toBe('“他说：‘你好。’”');
  });
  it("repairs one broken quotation among other valid quotations on the same line", () => {
    expect(format('“甲”他说“乙“', 'repairQuoteDirections')).toBe('“甲”他说“乙”');
    expect(format('”甲“，然后“乙”', 'repairQuoteDirections')).toBe('“甲”，然后“乙”');
    expect(format('‘甲’随后’乙‘', 'repairQuoteDirections')).toBe('‘甲’随后‘乙’');
  });
  it("repairs independent quote samples without pairing them across blank paragraphs", () => {
    const input = [
      '“一年之计在於春“',
      '',
      '”一年之计在於春“',
      '',
      '“”“',
      '',
      '““文字”',
      '',
      '“文字””',
      '',
      '“甲”他说“乙“',
      '',
      '“他说：‘你好。’”',
    ].join('\n');
    const expected = [
      '“一年之计在於春”',
      '',
      '“一年之计在於春”',
      '',
      '“”',
      '',
      '“文字”',
      '',
      '“文字”',
      '',
      '“甲”他说“乙”',
      '',
      '“他说：‘你好。’”',
    ].join('\n');
    expect(format(input, 'repairQuoteDirections')).toBe(expected);
  });
  it("repairs reversed quote samples on consecutive lines unless both sides bridge a real multiline quote", () => {
    const input = [
      '“一年之计在於春“',
      '”一年之计在於春“',
      '“”“',
    ].join('\n');
    const expected = [
      '“一年之计在於春”',
      '“一年之计在於春”',
      '“”',
    ].join('\n');
    expect(format(input, 'repairQuoteDirections')).toBe(expected);
    expect(format('“第一段\n”第二句“\n第三段。”', 'repairQuoteDirections'))
      .toBe('“第一段\n”第二句“\n第三段。”');
  });
  it("preserves paired and cross-paragraph quotations", () => {
    for (const input of ['“你好。”', '“第一段。\n\n第二段。”', '“第一段\n”第二句“\n第三段。”']) {
      expect(format(input, 'repairQuoteDirections', 'completeMissingQuotes')).toBe(input);
    }
  });
  it("completes an unpaired single-sentence dialogue with an explicit colon boundary", () => {
    expect(format('他说：“你好。', 'completeMissingQuotes')).toBe('他说：“你好。”');
    expect(format('他说：你好。”', 'completeMissingQuotes')).toBe('他说：“你好。”');
    expect(format('她说：‘好！', 'completeMissingQuotes')).toBe('她说：‘好！’');
  });
  it("leaves ambiguous boundaries and titles for diagnostics", () => {
    for (const input of ['“你好。', '你好。”', '他说：“你好。她转身离开。', '他说：“你好', '《书名', '他说：“第一段。\n\n第二段。”']) {
      expect(format(input, 'completeMissingQuotes')).toBe(input);
    }
  });
  it("preserves protected text even when syntax protection is disabled", () => {
    const input = '---\ntitle: ”你好。“\n---\n```\n他说：“你好。\n```\n他说：“`你好`。\n[”你好。“](https://example.com)';
    expect(format(input, 'repairQuoteDirections', 'completeMissingQuotes')).toBe(input);
    expect(applyFormattingRules(input, {
      ...createDisabledFormattingRules(), repairQuoteDirections: true, completeMissingQuotes: true,
    }, DEFAULT_FORMATTING_RULE_ORDER, { protectSyntax: false })).toBe(input);
  });
  it("does not normalize quote runs inside protected Markdown regions", () => {
    const input = '---\ntitle: “”“\n---\n```text\n““文字”\n```\n正文 `“文字””`。\n[标题](https://example.com/“”“)';
    expect(format(input, 'repairQuoteDirections')).toBe(input);
  });
  it("normalizes accidental repeats without erasing conventional expressive punctuation", () => {
    expect(format('你好，，世界。。好！！！真的吗？？？！？！！？？……——。。。', 'normalizeRepeatedPunctuation'))
      .toBe('你好，世界。好！！真的吗？？！？！！？？……——。。。');
  });
  it("registers selectable rules with conservative defaults", () => {
    expect(DEFAULT_FORMATTING_RULES.repairQuoteDirections).toBe(true);
    expect(DEFAULT_FORMATTING_RULES.completeMissingQuotes).toBe(false);
    expect(DEFAULT_FORMATTING_RULES.normalizeRepeatedPunctuation).toBe(false);
    for (const key of ['repairQuoteDirections', 'completeMissingQuotes', 'normalizeRepeatedPunctuation']) {
      expect(FORMATTING_RULES.some(rule => rule.key === key)).toBe(true);
      expect(FORMATTING_RULE_GROUPS.some(group => group.keys.some(item => item === key))).toBe(true);
    }
  });
  it("is opt-in where required, preserves CRLF and is idempotent", () => {
    const input = '他说：‘你好。\r\n\r\n”再见。“';
    expect(format(input)).toBe(input);
    const output = format(input, 'repairQuoteDirections', 'completeMissingQuotes');
    expect(output).toBe('他说：‘你好。’\r\n\r\n“再见。”');
    expect(format(output, 'repairQuoteDirections', 'completeMissingQuotes')).toBe(output);
  });
  it("runs through the shared one-click pipeline using serialized saved options", () => {
    const rules = JSON.parse(JSON.stringify({ ...createDisabledFormattingRules(),
      repairQuoteDirections: true, completeMissingQuotes: true,
      normalizeRepeatedPunctuation: true, normalizeEllipsis: true,
    }));
    expect(applyFormattingPipeline('”你好，，世界。“\n\n她说：‘好！\n\n等一下。。。', rules,
      DEFAULT_FORMATTING_RULE_ORDER, DEFAULT_MARKDOWN_FORMATTING_OPTIONS))
      .toBe('“你好，世界。”\n\n她说：‘好！’\n\n等一下……');
  });
});
