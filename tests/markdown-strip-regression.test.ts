import { describe, expect, it } from "vitest";
import { applyMarkdownFormatting, DEFAULT_MARKDOWN_FORMATTING_OPTIONS } from "../src/markdown-formatting";
import { markdownToPlainText } from "../src/text-export";

const strip = (text: string) => applyMarkdownFormatting(text, {
  ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS, mode: "strip",
});

describe.each([['formatting', strip], ['export', markdownToPlainText]] as const)('%s Markdown cleanup', (_name, convert) => {
  it('removes deeply indented tasks and callout metadata', () => {
    expect(convert('- [x] 父项\n    - [X] 子项\n\t\t- [ ] 孙项\n> [!NOTE]- Title\n> 正文'))
      .toBe('父项\n子项\n孙项\nTitle\n正文');
  });
  it('cleans Obsidian inline syntax while retaining math and footnote text', () => {
    expect(convert('==高亮== $数学113$ %%隐藏%%\n引用[^1]\n[^1]: 脚注\n![[正文/这是数据库.base]]'))
      .toBe('高亮 数学113\n引用\n脚注\n正文/这是数据库.base');
  });
  it('removes multiline comments and math wrappers, preserving literal code', () => {
    expect(convert('前%%隐藏\n隐藏%%后\n$$\nx_1 + **y**\n$$\n`==原样== %%原样%%`'))
      .toBe('前\n后\n\nx_1 + **y**\n\n==原样== %%原样%%');
  });
  it('converts table cells and removes separator rows without damaging ordinary pipes', () => {
    expect(convert('| 名称 | 值 |\n| :--- | ---: |\n| **甲** | `a|b` |\n\n普通 a | b'))
      .toBe('名称\t值\n\n甲\ta|b\n\n普通 a | b');
  });
  it('preserves escaped markers, currency and unmatched syntax', () => {
    expect(convert('\\*原样\\*，价格 $5 和 $10，未闭合 ==文字'))
      .toBe('*原样*，价格 $5 和 $10，未闭合 ==文字');
  });
});

it('exports fence contents literally and closes only a matching fence', () => {
  expect(markdownToPlainText('````txt\n**原样**\n```\n%%原样%%\n````\n==正文=='))
    .toBe('**原样**\n```\n%%原样%%\n正文');
});
