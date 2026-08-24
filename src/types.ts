export const PAPER_THEME_OPTIONS = [
  { value: "plain", label: "跟随 Obsidian" },
  { value: "warm", label: "暖色纸张" },
  { value: "cream", label: "柔和米白" },
  { value: "sepia", label: "复古书页" },
  { value: "rose", label: "浅粉纸张" },
  { value: "sage", label: "青绿纸张" },
  { value: "blue", label: "雾蓝纸张" },
  { value: "dark", label: "深色纸张" },
  { value: "custom", label: "自定义图片" },
] as const;

export type PaperTheme = (typeof PAPER_THEME_OPTIONS)[number]["value"];

export function normalizePaperTheme(value: unknown): PaperTheme {
  return PAPER_THEME_OPTIONS.some((option) => option.value === value)
    ? value as PaperTheme
    : "warm";
}

export type BuiltinFormattingPresetId = "novel" | "compact" | "punctuation";
export type FormattingPresetId = BuiltinFormattingPresetId | "custom" | `saved:${string}`;
export type ExportFormat = "txt" | "docx" | "png";
export type ExportScope = "current" | "folder";
export type InterfaceMode = "simple" | "professional";
export type InterfaceAccentMode = "theme" | "custom";
export type LayoutPresetId = "default" | "custom" | "obsidian" | `saved:${string}`;

export const TYPEWRITER_CURSOR_POSITIONS = [30, 40, 50, 60, 70] as const;

export function normalizeTypewriterCursorPosition(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 50;
  return TYPEWRITER_CURSOR_POSITIONS.reduce((nearest, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(nearest - numeric) ? candidate : nearest,
  50);
}

export function shouldRepositionTypewriter(
  previousPosition: number | undefined,
  previousMode: boolean,
  nextPosition: number,
  nextMode: boolean,
): boolean {
  return previousPosition !== undefined
    && nextMode
    && (previousPosition !== nextPosition || !previousMode);
}

export interface FormattingRules {
  trimLeadingWhitespace: boolean;
  trimTrailingWhitespace: boolean;
  trimDocumentBlankLines: boolean;
  collapseBlankLines: boolean;
  ensureBlankLineBetweenParagraphs: boolean;
  removeAllBlankLines: boolean;
  collapseRepeatedSpaces: boolean;
  removeSpacesBetweenChinese: boolean;
  addSpacesBetweenChineseAndLatin: boolean;
  removeSpacesBetweenChineseAndLatin: boolean;
  removeAllSpaces: boolean;
  addManualIndentation: boolean;
  removeManualIndentation: boolean;
  convertHalfwidthPunctuation: boolean;
  convertFullwidthPunctuation: boolean;
  normalizeStraightQuotes: boolean;
  convertCurlyQuotesToCorner: boolean;
  convertCornerQuotesToCurly: boolean;
  normalizeEllipsis: boolean;
}

export type FormattingRuleKey = keyof FormattingRules;

export interface CustomFormattingPreset {
  id: string;
  name: string;
  rules: FormattingRules;
  ruleOrder: FormattingRuleKey[];
}

export interface LayoutPresetValues {
  fontFamily: string;
  headingFontFamily: string;
  quoteFontFamily: string;
  boldFontFamily: string;
  italicFontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  contentWidth: number;
  paperTheme: PaperTheme;
  customPaperImage: string;
  justifyText: boolean;
}

/**
 * “跟随 Obsidian”时用户主动调整过的项目。
 * 未出现的字段必须完全交给 Obsidian 的原生 CSS 处理。
 */
export type LayoutPresetOverrides = Partial<LayoutPresetValues>;

export interface CustomLayoutPreset {
  id: string;
  name: string;
  values: LayoutPresetValues;
}

export interface DocumentLayoutSettings {
  layoutPreset: LayoutPresetId;
  values: LayoutPresetValues;
  obsidianOverrides?: LayoutPresetOverrides;
}

export interface CssClassLayoutRule {
  id: string;
  cssClass: string;
  layoutPreset: "default" | "obsidian" | `saved:${string}`;
}

export interface ChineseWritingSettings {
  activationClass: string;
  fontFamily: string;
  headingFontFamily: string;
  /** 旧版兼容字段：v0.11 起由引用、粗体和斜体字体分别接管。 */
  specialFontFamily: string;
  quoteFontFamily: string;
  boldFontFamily: string;
  italicFontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  contentWidth: number;
  paperTheme: PaperTheme;
  customPaperImage: string;
  justifyText: boolean;
  showDiagnostics: boolean;
  showStatusBar: boolean;
  typewriterMode: boolean;
  typewriterCursorPosition: number;
  highlightCurrentLine: boolean;
  formattingPreset: FormattingPresetId;
  formattingRules: FormattingRules;
  formattingRuleOrder: FormattingRuleKey[];
  customFormattingPresets: CustomFormattingPreset[];
  layoutPreset: LayoutPresetId;
  obsidianOverrides: LayoutPresetOverrides;
  customLayoutPresets: CustomLayoutPreset[];
  documentLayouts: Record<string, DocumentLayoutSettings>;
  cssClassLayoutRules: CssClassLayoutRule[];
  preferredExportFormat: ExportFormat;
  preferredExportScope: ExportScope;
  includeFileTitles: boolean;
  stripMarkdownOnExport: boolean;
  wordTitlePage: boolean;
  wordPageNumbers: boolean;
  wordHeader: boolean;
  openFolderAfterExport: boolean;
  interfaceMode: InterfaceMode;
  interfaceAccentMode: InterfaceAccentMode;
  interfaceAccentColor: string;
}

export const DEFAULT_FORMATTING_RULES: FormattingRules = {
  trimLeadingWhitespace: false,
  trimTrailingWhitespace: true,
  trimDocumentBlankLines: true,
  collapseBlankLines: true,
  ensureBlankLineBetweenParagraphs: true,
  removeAllBlankLines: false,
  collapseRepeatedSpaces: true,
  removeSpacesBetweenChinese: true,
  addSpacesBetweenChineseAndLatin: false,
  removeSpacesBetweenChineseAndLatin: false,
  removeAllSpaces: false,
  addManualIndentation: false,
  removeManualIndentation: true,
  convertHalfwidthPunctuation: false,
  convertFullwidthPunctuation: false,
  normalizeStraightQuotes: false,
  convertCurlyQuotesToCorner: false,
  convertCornerQuotesToCurly: false,
  normalizeEllipsis: true,
};

export const DEFAULT_FORMATTING_RULE_ORDER: FormattingRuleKey[] = [
  "trimLeadingWhitespace",
  "trimTrailingWhitespace",
  "trimDocumentBlankLines",
  "collapseBlankLines",
  "ensureBlankLineBetweenParagraphs",
  "removeAllBlankLines",
  "collapseRepeatedSpaces",
  "removeSpacesBetweenChinese",
  "addSpacesBetweenChineseAndLatin",
  "removeSpacesBetweenChineseAndLatin",
  "removeAllSpaces",
  "addManualIndentation",
  "removeManualIndentation",
  "convertHalfwidthPunctuation",
  "convertFullwidthPunctuation",
  "normalizeStraightQuotes",
  "convertCurlyQuotesToCorner",
  "convertCornerQuotesToCurly",
  "normalizeEllipsis",
];

export const DEFAULT_SETTINGS: ChineseWritingSettings = {
  activationClass: "chinese-novel",
  fontFamily:
    '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  headingFontFamily:
    '"思源黑体", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "微软雅黑", sans-serif',
  specialFontFamily:
    '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  quoteFontFamily:
    '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  boldFontFamily:
    '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  italicFontFamily:
    '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  fontSize: 18,
  lineHeight: 1.9,
  paragraphSpacing: 0.5,
  firstLineIndent: 2,
  contentWidth: 42,
  paperTheme: "warm",
  customPaperImage: "",
  justifyText: true,
  showDiagnostics: true,
  showStatusBar: true,
  typewriterMode: false,
  typewriterCursorPosition: 50,
  highlightCurrentLine: false,
  formattingPreset: "novel",
  formattingRules: { ...DEFAULT_FORMATTING_RULES },
  formattingRuleOrder: [...DEFAULT_FORMATTING_RULE_ORDER],
  customFormattingPresets: [],
  layoutPreset: "default",
  obsidianOverrides: {},
  customLayoutPresets: [],
  documentLayouts: {},
  cssClassLayoutRules: [],
  preferredExportFormat: "txt",
  preferredExportScope: "current",
  includeFileTitles: true,
  stripMarkdownOnExport: true,
  wordTitlePage: false,
  wordPageNumbers: true,
  wordHeader: false,
  openFolderAfterExport: false,
  interfaceMode: "professional",
  interfaceAccentMode: "theme",
  interfaceAccentColor: "#bd765f",
};
