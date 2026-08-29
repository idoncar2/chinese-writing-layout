/**
 * 读取 Obsidian 当前正文排版基准，作为右侧“版式微调”的原生参照。
 * 仅用于显示参考，不会写入插件 settings。
 */

import { extractFontFamilyNames } from "./system-fonts";

export interface ObsidianTypographyBaseline {
  /** 正文字号（px） */
  fontSize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 字符之间的额外间距（px） */
  letterSpacing: number;
  /** 正文主题字体栈（可能为空字符串） */
  fontFamily: string;
  /** 段落间距（em） */
  paragraphSpacing: number;
}

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 1.5;
const DEFAULT_LETTER_SPACING = 0;
const DEFAULT_PARAGRAPH_SPACING = 0;
/**
 * 没有可读的字体名时，保存快照应继续使用当前 Obsidian 的继承字体，
 * 不能退回插件推荐字体。它同时适用于编辑器和阅读视图。
 */
export const OBSIDIAN_NATIVE_FONT_FAMILY = "inherit";

export function isObsidianFontPlaceholder(fontFamily: string): boolean {
  const names = extractFontFamilyNames(fontFamily);
  return names.length > 0 && names.every((name) => /^\?+$/u.test(name));
}

export function normalizeObsidianFontFamily(
  value: unknown,
  missingFallback: string,
): string {
  if (typeof value !== "string") return missingFallback;
  const trimmed = value.trim();
  if (!trimmed) return missingFallback;
  return isObsidianFontPlaceholder(trimmed)
    ? OBSIDIAN_NATIVE_FONT_FAMILY
    : trimmed;
}

/** 将空值、纯后备字体和历史问号占位值显示为 Obsidian 的语义默认字体。 */
export function getObsidianFontDisplayName(fontFamily: string): string {
  const normalized = fontFamily.trim().toLowerCase();
  if (
    normalized === OBSIDIAN_NATIVE_FONT_FAMILY
    || /^var\(\s*--font-(?:editor|text-theme)\b/iu.test(normalized)
    || isObsidianFontPlaceholder(fontFamily)
  ) {
    return "默认";
  }
  const names = extractFontFamilyNames(fontFamily)
    .filter((name) => !/^\?+$/u.test(name));
  if (names.length === 0) return "默认";
  return names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;
}

function parseCssNumber(value: string, fallback: number): number {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseCssLength(value: string): number | undefined {
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(?:px)?$/i);
  if (!match) return undefined;
  const numeric = Number.parseFloat(match[1]!);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function getDefaultTypographyRoot(): HTMLElement {
  if (typeof document === "undefined") return {} as HTMLElement;
  return document.body ?? document.documentElement;
}

export function readObsidianTypographyBaseline(
  root: HTMLElement = getDefaultTypographyRoot(),
): ObsidianTypographyBaseline {
  const styles = getComputedStyle(root);
  const read = (name: string): string => styles.getPropertyValue(name).trim();
  const fontFamily = [
    read("--font-editor"),
    read("--font-text-theme"),
    styles.fontFamily.trim(),
  ].find((candidate) => candidate && !isObsidianFontPlaceholder(candidate))
    ?? OBSIDIAN_NATIVE_FONT_FAMILY;
  const letterSpacing = parseCssLength(read("--letter-spacing"))
    ?? (typeof styles.letterSpacing === "string"
      ? parseCssLength(styles.letterSpacing)
      : undefined)
    ?? DEFAULT_LETTER_SPACING;
  return {
    fontSize: parseCssNumber(read("--font-text-size"), DEFAULT_FONT_SIZE),
    lineHeight: parseCssNumber(read("--line-height-normal"), DEFAULT_LINE_HEIGHT),
    letterSpacing,
    fontFamily,
    paragraphSpacing: parseCssNumber(
      read("--p-spacing"),
      DEFAULT_PARAGRAPH_SPACING,
    ),
  };
}

/** 插件需要固定的标题档位，与正文字号解耦。 */
const HEADING_SIZE_KEYS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "inline-title",
] as const;
export type HeadingSizeKey = (typeof HEADING_SIZE_KEYS)[number];

/**
 * Obsidian 各档标题的像素尺寸。
 * 值为 undefined 表示该档无法从主题解析（应回退到 Obsidian 原生变量）。
 */
export type ObsidianHeadingSizes = Partial<Record<HeadingSizeKey, number>>;

/** 解析 `var(--x)` 单层引用（例如 `--inline-title-size: var(--h1-size)`）。 */
function resolveCssVarReference(root: HTMLElement, name: string): string {
  const styles = getComputedStyle(root);
  const raw = styles.getPropertyValue(name).trim();
  const reference = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!reference) return raw;
  return styles.getPropertyValue(reference[1]!).trim();
}

/**
 * 将长度文本按单位换算为 px：em 以正文基准字号为基数，
 * rem 以根元素字号为基数，px 直接使用。
 */
function cssLengthToPx(
  value: string,
  baseEmPx: number,
  baseRemPx: number,
): number | undefined {
  const match = value.match(/^(-?(?:\d+\.?\d*|\.\d+))(em|rem|px)?$/i);
  if (!match) return undefined;
  const numeric = Number.parseFloat(match[1]!);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "em":
      return numeric * baseEmPx;
    case "rem":
      return numeric * baseRemPx;
    default:
      return numeric;
  }
}

let cachedHeadingSizes: ObsidianHeadingSizes | undefined;
let cachedHeadingSignature = "";

/**
 * 读取 Obsidian 当前主题的标题档位尺寸（px），供插件在自定义正文字号时
 * 固定标题大小。em/rem 值按正文基准字号解析成 px，避免插件改正文
 * 字号时把标题一起放大；解析不了的档位返回 undefined。
 */
export function readObsidianHeadingSizes(
  root: HTMLElement = getDefaultTypographyRoot(),
): ObsidianHeadingSizes {
  const styles = getComputedStyle(root);
  const signature = HEADING_SIZE_KEYS
    .map((key) => styles.getPropertyValue(`--${key}-size`).trim())
    .join("|");
  if (cachedHeadingSizes && signature === cachedHeadingSignature) {
    return cachedHeadingSizes;
  }
  const baseEmPx = parseCssNumber(
    styles.getPropertyValue("--font-text-size").trim(),
    DEFAULT_FONT_SIZE,
  );
  const rootFontSize = typeof document === "undefined"
    ? DEFAULT_FONT_SIZE
    : parseCssNumber(getComputedStyle(document.documentElement).fontSize, DEFAULT_FONT_SIZE);
  const result: ObsidianHeadingSizes = {};
  for (const key of HEADING_SIZE_KEYS) {
    const raw = resolveCssVarReference(root, `--${key}-size`);
    const px = cssLengthToPx(raw, baseEmPx, rootFontSize);
    if (px !== undefined) result[key] = px;
  }
  cachedHeadingSizes = result;
  cachedHeadingSignature = signature;
  return result;
}

export function formatFontSize(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
}

export function formatLineHeight(value: number): string {
  return `${value.toFixed(1)}`;
}

export function formatLetterSpacing(value: number): string {
  return `${Number(value.toFixed(2))}px`;
}
