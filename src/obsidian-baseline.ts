/**
 * 读取 Obsidian 当前正文排版基准，作为右侧“版式微调”的原生参照。
 * 仅用于显示参考，不会写入插件 settings。
 */

export interface ObsidianTypographyBaseline {
  /** 正文字号（px） */
  fontSize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 正文主题字体栈（可能为空字符串） */
  fontFamily: string;
  /** 段落间距（em） */
  paragraphSpacing: number;
}

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 1.5;
const DEFAULT_PARAGRAPH_SPACING = 0;

function parseCssNumber(value: string, fallback: number): number {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function readObsidianTypographyBaseline(
  root: HTMLElement = document.documentElement,
): ObsidianTypographyBaseline {
  const styles = getComputedStyle(root);
  const read = (name: string): string => styles.getPropertyValue(name).trim();
  return {
    fontSize: parseCssNumber(read("--font-text-size"), DEFAULT_FONT_SIZE),
    lineHeight: parseCssNumber(read("--line-height-normal"), DEFAULT_LINE_HEIGHT),
    fontFamily: read("--font-text-theme"),
    paragraphSpacing: parseCssNumber(
      read("--p-spacing"),
      DEFAULT_PARAGRAPH_SPACING,
    ),
  };
}

export function formatFontSize(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
}

export function formatLineHeight(value: number): string {
  return `${value.toFixed(1)}`;
}
