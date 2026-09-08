import type { ChapterHeadingFormat } from "./types";

const DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const OUTPUT_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function parseNumber(source: string): number | undefined {
  if (/^[1-9]\d{0,3}$/u.test(source)) return Number(source);
  if (!/^[零〇一二两三四五六七八九十百千]+$/u.test(source)) return undefined;
  let total = 0;
  let digit: number | undefined;
  for (const character of source) {
    if (character in DIGITS) {
      digit = DIGITS[character];
      continue;
    }
    const unit = UNITS[character];
    if (!unit) return undefined;
    total += (digit ?? 1) * unit;
    digit = undefined;
  }
  total += digit ?? 0;
  if (total < 1 || total > 9999) return undefined;
  const canonicalSource = source.replaceAll("两", "二").replaceAll("〇", "零");
  return toChineseNumber(total) === canonicalSource ? total : undefined;
}

function toChineseNumber(value: number): string {
  const positions = [
    { divisor: 1000, unit: "千" },
    { divisor: 100, unit: "百" },
    { divisor: 10, unit: "十" },
    { divisor: 1, unit: "" },
  ];
  let result = "";
  let zeroPending = false;
  for (const { divisor, unit } of positions) {
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      if (result && value % divisor > 0) zeroPending = true;
      continue;
    }
    if (zeroPending) result += "零";
    zeroPending = false;
    if (!(divisor === 10 && digit === 1 && result === "")) result += OUTPUT_DIGITS[digit];
    result += unit;
  }
  return result;
}

export function normalizeChapterHeadingLine(line: string, target: ChapterHeadingFormat): string {
  const heading = /^([ \t]{0,3}#{1,6}[ \t]+)(.*)$/u.exec(line);
  if (!heading) return line;
  const body = heading[2];
  const unitStyle = /^第([1-9]\d{0,3}|[零〇一二两三四五六七八九十百千]+)(章|卷)[ \t　]*(.*)$/u.exec(body);
  const parenthesized = /^（([零〇一二两三四五六七八九十百千]+)）[ \t　]*(.*)$/u.exec(body);
  const listStyle = /^([1-9]\d{0,3})、[ \t　]*(.*)$/u.exec(body);
  const match = unitStyle ?? parenthesized ?? listStyle;
  if (!match) return line;
  const number = parseNumber(match[1]);
  if (number === undefined) return line;
  const title = match.at(-1)?.trim() ?? "";
  const unit = unitStyle ? unitStyle[2] : "章";
  const chinese = toChineseNumber(number);
  const prefix = target === "arabic-unit"
    ? `第${number}${unit}`
    : target === "chinese-unit"
      ? `第${chinese}${unit}`
      : target === "chinese-parenthesized"
        ? `（${chinese}）`
        : `${number}、`;
  return heading[1] + prefix + (title ? ` ${title}` : "");
}
