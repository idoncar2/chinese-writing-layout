import { extractFontFamilyNames, fontNameToCssFamily } from "./system-fonts";

export interface QuickFontOption {
  id: "song" | "hei" | "kai" | "fangsong";
  label: string;
  candidates: readonly string[];
}

export const QUICK_FONT_OPTIONS: readonly QuickFontOption[] = [
  {
    id: "song",
    label: "宋体",
    candidates: [
      "SimSun",
      "Songti SC",
      "STSong",
      "Noto Serif CJK SC",
      "Source Han Serif SC",
      "宋体",
    ],
  },
  {
    id: "hei",
    label: "黑体",
    candidates: [
      "SimHei",
      "Heiti SC",
      "STHeiti",
      "Microsoft YaHei",
      "Noto Sans CJK SC",
      "Source Han Sans SC",
      "微软雅黑",
    ],
  },
  {
    id: "kai",
    label: "楷体",
    candidates: [
      "KaiTi",
      "Kaiti SC",
      "STKaiti",
      "AR PL UKai CN",
      "楷体",
    ],
  },
  {
    id: "fangsong",
    label: "仿宋",
    candidates: [
      "FangSong",
      "STFangsong",
      "仿宋",
    ],
  },
] as const;

const FONT_AVAILABILITY_PROBE = "mmmmmmmmmwwwwwww中文写作0123456789";
const FONT_AVAILABILITY_BASELINES = ["monospace", "serif", "sans-serif"] as const;

export function isSystemFontAvailable(fontFamily: string): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return false;
  try {
    const cssFamily = fontNameToCssFamily(fontFamily);
    if (!document.fonts.check(
      `16px ${cssFamily}`,
      FONT_AVAILABILITY_PROBE,
    )) return false;

    const context = document.createElement("canvas").getContext("2d");
    if (!context) return false;
    const measure = (family: string): number => {
      context.font = `72px ${family}`;
      return context.measureText(FONT_AVAILABILITY_PROBE).width;
    };
    return FONT_AVAILABILITY_BASELINES.some((baseline) => (
      Math.abs(measure(`${cssFamily}, ${baseline}`) - measure(baseline)) > 0.01
    ));
  } catch {
    return false;
  }
}

export function findAvailableQuickFont(
  option: QuickFontOption,
  isAvailable: (fontFamily: string) => boolean = isSystemFontAvailable,
): string | undefined {
  return option.candidates.find((candidate) => isAvailable(candidate));
}

/**
 * Resolve the concrete font name used by a recommended font stack.
 *
 * The recommended style keeps its curated stack when one of those families
 * is available. If none is available, use the first concrete family exposed
 * by Obsidian instead of continuing to claim that the plugin uses its own
 * default font. This checks only the known stack and never enumerates fonts.
 */
export function resolveRecommendedFontName(
  recommendedFamily: string,
  obsidianFamily: string,
  isAvailable: (fontFamily: string) => boolean = isSystemFontAvailable,
): string | undefined {
  const recommendedName = extractFontFamilyNames(recommendedFamily)
    .find((fontFamily) => isAvailable(fontFamily));
  if (recommendedName) return recommendedName;
  return extractFontFamilyNames(obsidianFamily)
    .find((fontFamily) => !/^var\(/u.test(fontFamily));
}
