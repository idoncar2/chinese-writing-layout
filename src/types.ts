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
export type ExportFormat = "txt" | "md" | "docx" | "png";
export type ExportScope = "current" | "folder";
export type ImageExportWidth = 1080 | 1440 | 2160;

export const IMAGE_EXPORT_WIDTH_OPTIONS = [
  { value: 1080, label: "标准 · 1080px", description: "标准图片文件较小。" },
  { value: 1440, label: "高清 · 1440px", description: "高清适合大多数阅读和分享场景。" },
  { value: 2160, label: "超清 · 2160px", description: "超清更清晰，但内存占用和分图数量更高。" },
] as const;

export function normalizeImageExportWidth(value: unknown): ImageExportWidth {
  return value === 1080 || value === 2160 || value === 1440
    ? value
    : 1440;
}

export type InterfaceMode = "simple" | "professional";
export type InterfaceAccentMode = "theme" | "custom";
export type CountMode = "creative" | "body-characters";
export type LayoutPresetId = "default" | "custom" | "obsidian" | `saved:${string}`;
export type FontSource = "obsidian" | "builtin" | "user" | "system";

export type FontSelection =
  | { source: FontSource; id: string }
  | { source: "inherit"; id: "body" };

export interface UserFont {
  id: string;
  name: string;
  fileName: string;
  originalFileName: string;
  format: "ttf" | "otf" | "woff" | "woff2";
}

export type DocumentWritingMode = "force-on" | "force-off";
export type AutoApplyLayoutPresetId = Exclude<LayoutPresetId, "custom">;

export const CURRENT_SETTINGS_SCHEMA_VERSION = 2;

export const TYPEWRITER_CURSOR_POSITIONS = [30, 40, 50, 60, 70] as const;

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export function normalizeHeadingLevels(value: unknown): HeadingLevel[] {
  if (!Array.isArray(value)) return [1];
  const selected = new Set<HeadingLevel>();
  for (const candidate of value) {
    if (typeof candidate !== "number" || !Number.isInteger(candidate)) continue;
    if ((HEADING_LEVELS as readonly number[]).includes(candidate)) {
      selected.add(candidate as HeadingLevel);
    }
  }
  return HEADING_LEVELS.filter((level) => selected.has(level));
}

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

export type MarkdownHandlingMode = "none" | "repair" | "strip";

export interface MarkdownRepairOptions {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  /** Legacy option retained for saved settings; inline code is always protected. */
  inlineCode: boolean;
  markdownLink: boolean;
  obsidianLink: boolean;
  list: boolean;
  blockquote: boolean;
  heading: boolean;
}

export interface MarkdownFormattingOptions {
  mode: MarkdownHandlingMode;
  /** Protect Markdown syntax while applying ordinary text rules. */
  protectSyntax: boolean;
  repair: MarkdownRepairOptions;
}

export const DEFAULT_MARKDOWN_REPAIR_OPTIONS: MarkdownRepairOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  inlineCode: true,
  markdownLink: true,
  obsidianLink: true,
  list: true,
  blockquote: true,
  heading: true,
};

export const DEFAULT_MARKDOWN_FORMATTING_OPTIONS: MarkdownFormattingOptions = {
  mode: "none",
  protectSyntax: true,
  repair: { ...DEFAULT_MARKDOWN_REPAIR_OPTIONS },
};

export function normalizeMarkdownFormattingOptions(value: unknown): MarkdownFormattingOptions {
  const candidate = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const repairCandidate = candidate.repair && typeof candidate.repair === "object"
    ? candidate.repair as Record<string, unknown>
    : {};
  const mode: MarkdownHandlingMode = candidate.mode === "repair" || candidate.mode === "strip"
    ? candidate.mode
    : "none";
  return {
    mode,
    protectSyntax: typeof candidate.protectSyntax === "boolean"
      ? candidate.protectSyntax
      : DEFAULT_MARKDOWN_FORMATTING_OPTIONS.protectSyntax,
    repair: {
      bold: typeof repairCandidate.bold === "boolean"
        ? repairCandidate.bold
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.bold,
      italic: typeof repairCandidate.italic === "boolean"
        ? repairCandidate.italic
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.italic,
      strikethrough: typeof repairCandidate.strikethrough === "boolean"
        ? repairCandidate.strikethrough
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.strikethrough,
      inlineCode: typeof repairCandidate.inlineCode === "boolean"
        ? repairCandidate.inlineCode
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.inlineCode,
      markdownLink: typeof repairCandidate.markdownLink === "boolean"
        ? repairCandidate.markdownLink
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.markdownLink,
      obsidianLink: typeof repairCandidate.obsidianLink === "boolean"
        ? repairCandidate.obsidianLink
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.obsidianLink,
      list: typeof repairCandidate.list === "boolean"
        ? repairCandidate.list
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.list,
      blockquote: typeof repairCandidate.blockquote === "boolean"
        ? repairCandidate.blockquote
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.blockquote,
      heading: typeof repairCandidate.heading === "boolean"
        ? repairCandidate.heading
        : DEFAULT_MARKDOWN_REPAIR_OPTIONS.heading,
    },
  };
}

export interface CustomFormattingPreset {
  id: string;
  name: string;
  rules: FormattingRules;
  ruleOrder: FormattingRuleKey[];
  markdownFormatting: MarkdownFormattingOptions;
}

export interface LayoutPresetValues {
  bodyFont: FontSelection;
  headingFont: FontSelection;
  quoteFont: FontSelection;
  boldFont: FontSelection;
  italicFont: FontSelection;
  /** Legacy CSS font fields retained while consumers migrate to FontSelection. */
  fontFamily: string;
  headingFontFamily: string;
  quoteFontFamily: string;
  boldFontFamily: string;
  italicFontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** 字符之间的额外间距（px） */
  letterSpacing: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  contentWidth: number;
  /** Follow Obsidian 保存快照时保留的实际内容区宽度（px）。 */
  contentWidthPx?: number;
  leftMargin: number;
  rightMargin: number;
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

interface AutoApplyRuleBase {
  id: string;
  layoutPreset: AutoApplyLayoutPresetId;
  /** Legacy migrated CSS rules leave this false so their activation semantics do not change. */
  activateWritingMode: boolean;
}

export interface FolderAutoApplyRule extends AutoApplyRuleBase {
  kind: "folder";
  folderPath: string;
  includeSubfolders: boolean;
}

export interface TagAutoApplyRule extends AutoApplyRuleBase {
  kind: "tag";
  tag: string;
}

export interface FilenameAutoApplyRule extends AutoApplyRuleBase {
  kind: "filename";
  pattern: string;
}

export interface CssClassAutoApplyRule extends AutoApplyRuleBase {
  kind: "css-class";
  cssClass: string;
}

export type AutoApplyRule =
  | FolderAutoApplyRule
  | TagAutoApplyRule
  | FilenameAutoApplyRule
  | CssClassAutoApplyRule;

export interface ChineseWritingSettings {
  settingsSchemaVersion: number;
  activationClass: string;
  defaultWritingModeEnabled: boolean;
  autoApplyRules: AutoApplyRule[];
  documentWritingModes: Record<string, DocumentWritingMode>;
  bodyFont: FontSelection;
  headingFont: FontSelection;
  quoteFont: FontSelection;
  boldFont: FontSelection;
  italicFont: FontSelection;
  /** Legacy CSS font fields retained for compatibility during the font migration. */
  fontFamily: string;
  headingFontFamily: string;
  /** 旧版兼容字段：v0.11 起由引用、粗体和斜体字体分别接管。 */
  specialFontFamily: string;
  quoteFontFamily: string;
  boldFontFamily: string;
  italicFontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  contentWidth: number;
  /** 保存原生版式快照时使用；普通设置没有此字段。 */
  contentWidthPx?: number;
  leftMargin: number;
  rightMargin: number;
  paperTheme: PaperTheme;
  customPaperImage: string;
  justifyText: boolean;
  centerHeadings: boolean;
  centerHeadingLevels: HeadingLevel[];
  showDiagnostics: boolean;
  showStatusBar: boolean;
  countMode: CountMode;
  typewriterMode: boolean;
  /** Runtime entry behavior only; it must never overwrite typewriterMode. */
  autoTypewriterOnWritingMode: boolean;
  typewriterCursorPosition: number;
  highlightCurrentLine: boolean;
  formattingPreset: FormattingPresetId;
  formattingRules: FormattingRules;
  formattingRuleOrder: FormattingRuleKey[];
  markdownFormatting: MarkdownFormattingOptions;
  customFormattingPresets: CustomFormattingPreset[];
  userFonts: UserFont[];
  layoutPreset: LayoutPresetId;
  obsidianOverrides: LayoutPresetOverrides;
  customLayoutPresets: CustomLayoutPreset[];
  documentLayouts: Record<string, DocumentLayoutSettings>;
  cssClassLayoutRules: CssClassLayoutRule[];
  preferredExportFormat: ExportFormat;
  preferredExportScope: ExportScope;
  imageExportWidth: ImageExportWidth;
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
  settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  activationClass: "chinese-novel",
  defaultWritingModeEnabled: false,
  autoApplyRules: [],
  documentWritingModes: {},
  bodyFont: { source: "system", id: "思源宋体" },
  headingFont: { source: "system", id: "思源黑体" },
  quoteFont: { source: "inherit", id: "body" },
  boldFont: { source: "inherit", id: "body" },
  italicFont: { source: "inherit", id: "body" },
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
  letterSpacing: 0,
  paragraphSpacing: 0.5,
  firstLineIndent: 2,
  contentWidth: 42,
  leftMargin: 0,
  rightMargin: 0,
  paperTheme: "warm",
  customPaperImage: "",
  justifyText: true,
  centerHeadings: false,
  centerHeadingLevels: [1],
  showDiagnostics: true,
  showStatusBar: true,
  countMode: "creative",
  typewriterMode: false,
  autoTypewriterOnWritingMode: false,
  typewriterCursorPosition: 50,
  highlightCurrentLine: false,
  formattingPreset: "novel",
  formattingRules: { ...DEFAULT_FORMATTING_RULES },
  formattingRuleOrder: [...DEFAULT_FORMATTING_RULE_ORDER],
  markdownFormatting: {
    ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
    repair: { ...DEFAULT_MARKDOWN_REPAIR_OPTIONS },
  },
  customFormattingPresets: [],
  userFonts: [],
  layoutPreset: "default",
  obsidianOverrides: {},
  customLayoutPresets: [],
  documentLayouts: {},
  cssClassLayoutRules: [],
  preferredExportFormat: "txt",
  preferredExportScope: "current",
  imageExportWidth: 1440,
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
