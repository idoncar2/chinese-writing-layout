import {
  type Editor,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  normalizePath,
  Platform,
  Plugin,
  setIcon,
  TFile,
  type WorkspaceLeaf,
} from "obsidian";
import { createDocx } from "./docx-export";
import { createWritingEditorExtension } from "./editor-extension";
import { ExportModal } from "./export-modal";
import {
  applyFormattingRules,
  createDisabledFormattingRules,
  normalizeRuleOrder,
} from "./formatting";
import { FormattingModal } from "./formatting-modal";
import { normalizeFontFamily } from "./font-options";
import { createPngPages } from "./image-export";
import {
  captureLayoutPreset,
  findCssClassLayoutRule,
  getEditedLayoutPresetId,
  getLayoutPresetValues,
  hasLayoutPresetOverrides,
  normalizeCssClassLayoutRules,
  normalizeLayoutPresetId,
  normalizeLayoutPresetOverrides,
  normalizeLayoutPresetValues,
} from "./layout-presets";
import { readObsidianTypographyBaseline } from "./obsidian-baseline";
import { ChineseWritingSettingTab } from "./settings";
import { focusWindowsFolder } from "./system-folder";
import {
  analyzeChineseText,
  countWritingCharacters,
} from "./text-analysis";
import {
  DEFAULT_FORMATTING_RULES,
  DEFAULT_SETTINGS,
  PAPER_THEME_OPTIONS,
  type ChineseWritingSettings,
  type CssClassLayoutRule,
  type CustomFormattingPreset,
  type CustomLayoutPreset,
  type DocumentLayoutSettings,
  type ExportFormat,
  type ExportScope,
  type FormattingPresetId,
  type FormattingRuleKey,
  type FormattingRules,
  type InterfaceAccentMode,
  type InterfaceMode,
  type LayoutPresetId,
  type LayoutPresetOverrides,
  type LayoutPresetValues,
  normalizeTypewriterCursorPosition,
  normalizePaperTheme,
  shouldRepositionTypewriter,
} from "./types";
import {
  getAccentContrastColor,
  normalizeAccentColor,
  normalizeInterfaceAccentMode,
} from "./ui-theme";
import type { TextDiagnostic } from "./text-analysis";
import {
  combineExportSources,
  exportBlocksToPlainText,
  getAvailableExportBaseName,
  getAvailableExportPath,
  type ExportSource,
} from "./text-export";
import {
  WRITING_PANEL_VIEW_TYPE,
  WritingPanelView,
} from "./writing-panel";

const PAPER_CLASSES = PAPER_THEME_OPTIONS.map((option) => `cw-paper-${option.value}`);
const LAYOUT_CSS_VARIABLES = [
  "--cw-font-family",
  "--cw-heading-font-family",
  "--cw-quote-font-family",
  "--cw-bold-font-family",
  "--cw-italic-font-family",
  "--cw-font-size",
  "--cw-line-height",
  "--cw-paragraph-spacing",
  "--cw-first-line-indent",
  "--cw-content-width",
  "--cw-paper-image",
] as const;
const FOLLOW_OBSIDIAN_OVERRIDE_CLASSES = [
  "cw-follow-override-font-family",
  "cw-follow-override-heading-font-family",
  "cw-follow-override-quote-font-family",
  "cw-follow-override-bold-font-family",
  "cw-follow-override-italic-font-family",
  "cw-follow-override-font-size",
  "cw-follow-override-line-height",
  "cw-follow-override-paragraph-spacing",
  "cw-follow-override-first-line-indent",
  "cw-follow-override-content-width",
  "cw-follow-override-paper-theme",
  "cw-follow-override-custom-paper-image",
  "cw-follow-override-justify-text",
] as const;
const EXPORT_FOLDER = "写作导出";
const LEGACY_DEFAULT_FONT_FAMILY =
  '"Noto Serif CJK SC", "Source Han Serif SC", "思源宋体", "宋体", serif';

interface ExportRequest {
  format: ExportFormat;
  scope: ExportScope;
  includeFileTitles: boolean;
  stripMarkdown: boolean;
  openFolderAfterExport: boolean;
  wordTitlePage: boolean;
  wordPageNumbers: boolean;
  wordHeader: boolean;
}

export default class ChineseWritingLayoutPlugin extends Plugin {
  settings: ChineseWritingSettings = { ...DEFAULT_SETTINGS };
  private statusBarItem?: HTMLElement;
  private statusUpdateTimer?: number;
  private lastMarkdownLeaf?: WorkspaceLeaf;
  private focusModeEnabled = false;
  private focusExitButton?: HTMLButtonElement;
  private appliedTypewriterPosition?: number;
  private appliedTypewriterMode = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ChineseWritingSettingTab(this.app, this));
    this.registerEditorExtension(createWritingEditorExtension());
    this.registerView(
      WRITING_PANEL_VIEW_TYPE,
      (leaf) => new WritingPanelView(leaf, this),
    );

    this.addCommand({
      id: "toggle-novel-layout-current-note",
      name: "切换当前笔记的写作模式",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) void this.toggleNovelMode(view.file);
        return true;
      },
    });

    this.addCommand({
      id: "cycle-paper-theme",
      name: "切换写作纸张主题",
      callback: () => void this.cyclePaperTheme(),
    });

    this.addCommand({
      id: "open-writing-layout-panel",
      name: "打开写作排版面板",
      callback: () => void this.openWritingPanel(),
    });

    this.addCommand({
      id: "toggle-interface-mode",
      name: "切换简洁版与专业版",
      callback: () => void this.toggleInterfaceMode(),
    });

    this.addCommand({
      id: "toggle-typewriter-mode",
      name: "切换打字机模式",
      callback: () => void this.toggleTypewriterMode(),
    });

    this.addCommand({
      id: "toggle-focus-mode",
      name: "切换专注模式",
      callback: () => this.toggleFocusMode(),
    });

    this.addCommand({
      id: "export-current-note-as-text",
      name: "将当前笔记导出为纯文本",
      callback: () => void this.exportCurrentNoteAsText(),
    });

    this.addCommand({
      id: "open-export-dialog",
      name: "打开作品导出面板",
      callback: () => this.openExportModal(),
    });

    this.addCommand({
      id: "open-export-folder",
      name: "打开写作导出文件夹",
      callback: () => void this.openExportFolder(),
    });

    this.addCommand({
      id: "open-one-click-formatting",
      name: "打开一键排版",
      editorCallback: (editor) => this.openFormattingModal(editor),
    });

    this.addCommand({
      id: "remove-extra-spaces",
      name: "移除多余空格（选区或整篇）",
      editorCallback: (editor) =>
        void this.applyQuickFormatting(editor, {
          trimTrailingWhitespace: true,
          collapseRepeatedSpaces: true,
          removeSpacesBetweenChinese: true,
        }),
    });

    this.addCommand({
      id: "collapse-extra-blank-lines",
      name: "合并多余空行（选区或整篇）",
      editorCallback: (editor) =>
        void this.applyQuickFormatting(editor, { collapseBlankLines: true }),
    });

    this.addCommand({
      id: "add-blank-lines-between-paragraphs",
      name: "在正文段落之间增加空行（选区或整篇）",
      editorCallback: (editor) =>
        void this.applyQuickFormatting(editor, {
          collapseBlankLines: true,
          ensureBlankLineBetweenParagraphs: true,
        }),
    });

    this.addRibbonIcon(
      "book-open-text",
      "写作模式：关闭 → 简洁版 → 专业版 → 关闭",
      () => {
        void this.advanceWritingMode();
      },
    );

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("cw-status-bar");
    this.statusBarItem.setAttribute("aria-label", "中文写作排版统计");

    this.registerDomEvent(document, "keydown", (event) => {
      if (event.key === "Escape" && this.focusModeEnabled) {
        event.preventDefault();
        this.toggleFocusMode(false);
      }
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) this.lastMarkdownLeaf = leaf;
        this.syncAllViews();
        this.scheduleStatusUpdate();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.syncAllViews();
        this.refreshWritingPanels();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.scheduleStatusUpdate()),
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addSeparator();
        menu.addItem((item) =>
          item
            .setTitle("中文写作：一键排版…")
            .setIcon("wand-sparkles")
            .setSection("中文写作")
            .onClick(() => this.openFormattingModal(editor)),
        );
        menu.addItem((item) =>
          item
            .setTitle("移除多余空格")
            .setIcon("eraser")
            .setSection("中文写作")
            .onClick(() =>
              void this.applyQuickFormatting(editor, {
                trimTrailingWhitespace: true,
                collapseRepeatedSpaces: true,
                removeSpacesBetweenChinese: true,
              }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle("合并多余空行")
            .setIcon("list-collapse")
            .setSection("中文写作")
            .onClick(() =>
              void this.applyQuickFormatting(editor, {
                collapseBlankLines: true,
              }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle("段落之间增加空行")
            .setIcon("between-horizontal-start")
            .setSection("中文写作")
            .onClick(() =>
              void this.applyQuickFormatting(editor, {
                collapseBlankLines: true,
                ensureBlankLineBetweenParagraphs: true,
              }),
            ),
        );
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        this.syncAllViews();
        this.scheduleStatusUpdate();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const layout = this.settings.documentLayouts[oldPath];
        if (!layout || !(file instanceof TFile)) return;
        delete this.settings.documentLayouts[oldPath];
        this.settings.documentLayouts[file.path] = layout;
        void this.saveData(this.settings);
        this.syncAllViews();
        this.refreshWritingPanels();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!this.settings.documentLayouts[file.path]) return;
        delete this.settings.documentLayouts[file.path];
        void this.saveData(this.settings);
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) this.lastMarkdownLeaf = activeView.leaf;
      this.applySettings();
      this.syncAllViews();
      this.updateStatusBar();
      if (this.settings.interfaceMode === "simple") {
        this.app.workspace.detachLeavesOfType(WRITING_PANEL_VIEW_TYPE);
      }
    });
  }

  onunload(): void {
    if (this.statusUpdateTimer !== undefined) {
      window.clearTimeout(this.statusUpdateTimer);
    }
    this.removeGlobalStyles();
    this.toggleFocusMode(false, false);
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      this.clearViewClasses(leaf);
    }
    this.app.workspace.detachLeavesOfType(WRITING_PANEL_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ChineseWritingSettings> | null;
    const fontFamily = normalizeFontFamily(
      stored?.fontFamily === LEGACY_DEFAULT_FONT_FAMILY
        ? DEFAULT_SETTINGS.fontFamily
        : stored?.fontFamily,
      DEFAULT_SETTINGS.fontFamily,
    );
    const customFormattingPresets = (stored?.customFormattingPresets ?? []).map(
      (preset): CustomFormattingPreset => ({
        ...preset,
        rules: {
          ...DEFAULT_FORMATTING_RULES,
          ...(preset.rules ?? {}),
        },
        ruleOrder: normalizeRuleOrder(preset.ruleOrder),
      }),
    );
    const customLayoutPresets = (stored?.customLayoutPresets ?? []).map(
      (preset): CustomLayoutPreset => ({
        ...preset,
        values: normalizeLayoutPresetValues(preset.values),
      }),
    );
    const documentLayouts = Object.fromEntries(
      Object.entries(stored?.documentLayouts ?? {}).map(([path, layout]) => [
        path,
        {
          layoutPreset: normalizeLayoutPresetId(
            layout?.layoutPreset ?? "custom",
            customLayoutPresets,
          ),
          values: normalizeLayoutPresetValues(layout?.values),
          obsidianOverrides: normalizeLayoutPresetOverrides(layout?.obsidianOverrides),
        } satisfies DocumentLayoutSettings,
      ]),
    );
    const cssClassLayoutRules = normalizeCssClassLayoutRules(
      stored?.cssClassLayoutRules,
      customLayoutPresets,
    );
    const legacySpecialFontFamily = normalizeFontFamily(
      stored?.specialFontFamily === LEGACY_DEFAULT_FONT_FAMILY
        ? DEFAULT_SETTINGS.specialFontFamily
        : stored?.specialFontFamily,
      fontFamily,
    );
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored ?? {}),
      formattingRules: {
        ...DEFAULT_FORMATTING_RULES,
        ...(stored?.formattingRules ?? {}),
      },
      formattingRuleOrder: normalizeRuleOrder(stored?.formattingRuleOrder),
      customFormattingPresets,
      layoutPreset: normalizeLayoutPresetId(
        stored?.layoutPreset ?? (stored ? "custom" : "default"),
        customLayoutPresets,
      ),
      obsidianOverrides: normalizeLayoutPresetOverrides(stored?.obsidianOverrides),
      customLayoutPresets,
      documentLayouts,
      cssClassLayoutRules,
      fontFamily,
      headingFontFamily: normalizeFontFamily(
        stored?.headingFontFamily === LEGACY_DEFAULT_FONT_FAMILY
          ? DEFAULT_SETTINGS.headingFontFamily
          : stored?.headingFontFamily,
        DEFAULT_SETTINGS.headingFontFamily,
      ),
      specialFontFamily: legacySpecialFontFamily,
      quoteFontFamily: normalizeFontFamily(
        stored?.quoteFontFamily,
        legacySpecialFontFamily,
      ),
      boldFontFamily: normalizeFontFamily(
        stored?.boldFontFamily,
        legacySpecialFontFamily,
      ),
      italicFontFamily: normalizeFontFamily(
        stored?.italicFontFamily,
        legacySpecialFontFamily,
      ),
      paperTheme: normalizePaperTheme(stored?.paperTheme),
      interfaceAccentMode: normalizeInterfaceAccentMode(stored?.interfaceAccentMode),
      interfaceAccentColor: normalizeAccentColor(stored?.interfaceAccentColor),
      typewriterCursorPosition: normalizeTypewriterCursorPosition(
        stored?.typewriterCursorPosition,
      ),
    };
  }

  async saveAndApplySettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySettings();
    this.syncAllViews();
    this.updateStatusBar();
    this.refreshWritingPanels();
  }

  previewSettings(patch: Partial<ChineseWritingSettings>): void {
    Object.assign(this.settings, patch);
    this.applySettings();
    this.syncAllViews();
    this.updateStatusBar();
  }

  getCurrentLayoutSettings(): LayoutPresetValues {
    return this.getLayoutSettingsForFile(this.getWritingMarkdownView()?.file ?? null);
  }

  getGlobalLayoutSettings(): LayoutPresetValues {
    if (this.settings.layoutPreset === "obsidian") {
      return {
        ...this.captureObsidianLayoutValues(),
        ...this.settings.obsidianOverrides,
      };
    }
    return normalizeLayoutPresetValues(captureLayoutPreset(this.settings));
  }

  getCurrentLayoutPresetId(): LayoutPresetId {
    return this.getLayoutPresetIdForFile(this.getWritingMarkdownView()?.file ?? null);
  }

  hasCurrentFollowObsidianOverrides(): boolean {
    const file = this.getWritingMarkdownView()?.file ?? null;
    return this.getLayoutPresetIdForFile(file) === "obsidian"
      && hasLayoutPresetOverrides(this.getFollowObsidianOverridesForFile(file));
  }

  getCurrentCssClassLayoutRule(): CssClassLayoutRule | null {
    return this.getCssClassLayoutRuleForFile(this.getWritingMarkdownView()?.file ?? null);
  }

  getLayoutPresetLabel(presetId: LayoutPresetId): string {
    if (presetId === "default") return "推荐写作版式";
    if (presetId === "obsidian") return "跟随 Obsidian";
    if (presetId === "custom") return "当前自定义设置";
    return this.settings.customLayoutPresets.find(
      (preset) => preset.id === presetId.slice("saved:".length),
    )?.name ?? "已删除的模板";
  }

  isCurrentDocumentLayoutEnabled(): boolean {
    const file = this.getWritingMarkdownView()?.file;
    return Boolean(file && this.settings.documentLayouts[file.path]);
  }

  async setCurrentDocumentLayoutEnabled(enabled: boolean): Promise<void> {
    const file = this.getWritingMarkdownView()?.file;
    if (!file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    if (enabled) {
      const values = this.getLayoutSettingsForFile(file);
      const layoutPreset = this.getLayoutPresetIdForFile(file);
      this.settings.documentLayouts[file.path] = {
        layoutPreset,
        values,
        obsidianOverrides: layoutPreset === "obsidian"
          ? { ...this.getFollowObsidianOverridesForFile(file) }
          : {},
      };
    } else {
      delete this.settings.documentLayouts[file.path];
    }
    await this.saveAndApplySettings();
    new Notice(enabled ? "当前笔记已启用独立版式" : "当前笔记已恢复使用全局版式");
  }

  previewLayoutSettings(patch: Partial<LayoutPresetValues>): void {
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCssClass(file) : undefined;
    if (documentLayout) {
      if (documentLayout.layoutPreset === "obsidian") {
        Object.assign(
          documentLayout.obsidianOverrides ??= {},
          normalizeLayoutPresetOverrides(patch),
        );
      } else {
        Object.assign(documentLayout.values, patch);
      }
    } else if (this.settings.layoutPreset === "obsidian") {
      Object.assign(
        this.settings.obsidianOverrides,
        normalizeLayoutPresetOverrides(patch),
      );
    } else {
      Object.assign(this.settings, patch);
    }
    this.syncAllViews();
  }

  previewGlobalLayoutSettings(patch: Partial<LayoutPresetValues>): void {
    if (this.settings.layoutPreset === "obsidian") {
      Object.assign(
        this.settings.obsidianOverrides,
        normalizeLayoutPresetOverrides(patch),
      );
    } else {
      Object.assign(this.settings, patch);
    }
    this.applySettings();
    this.syncAllViews();
  }

  markLayoutPresetEdited(): void {
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCssClass(file) : undefined;
    if (documentLayout) {
      documentLayout.layoutPreset = getEditedLayoutPresetId(documentLayout.layoutPreset);
      return;
    }
    this.settings.layoutPreset = getEditedLayoutPresetId(this.settings.layoutPreset);
  }

  markGlobalLayoutPresetEdited(): void {
    this.settings.layoutPreset = getEditedLayoutPresetId(this.settings.layoutPreset);
  }

  async commitSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshWritingPanels();
  }

  async resetSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      formattingRules: { ...DEFAULT_FORMATTING_RULES },
      formattingRuleOrder: [...DEFAULT_SETTINGS.formattingRuleOrder],
      customFormattingPresets: [],
      layoutPreset: DEFAULT_SETTINGS.layoutPreset,
      obsidianOverrides: {},
      customLayoutPresets: [],
      documentLayouts: {},
      cssClassLayoutRules: [],
    };
    await this.saveAndApplySettings();
  }

  private getLayoutSettingsForFile(file: TFile | null): LayoutPresetValues {
    const presetId = this.getLayoutPresetIdForFile(file);
    if (presetId === "obsidian") {
      return {
        ...this.captureObsidianLayoutValues(),
        ...this.getFollowObsidianOverridesForFile(file),
      };
    }
    const documentLayout = file ? this.settings.documentLayouts[file.path] : undefined;
    if (documentLayout?.values) return normalizeLayoutPresetValues(documentLayout.values);
    const rule = this.getCssClassLayoutRuleForFile(file);
    const ruleValues = rule
      ? getLayoutPresetValues(rule.layoutPreset, this.settings.customLayoutPresets)
      : null;
    return ruleValues ?? normalizeLayoutPresetValues(captureLayoutPreset(this.settings));
  }

  private readCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private isReadableLineWidthEnabled(): boolean {
    const view = this.getWritingMarkdownView();
    return Boolean(
      (view?.containerEl ?? document).querySelector(".is-readable-line-width"),
    );
  }

  /**
   * 读取 Obsidian 当前排版，供控制面板与导出预览显示参考。
   * 跟随模式的实际页面样式绝不使用这个快照，而是保留原生选择器。
   */
  private captureObsidianLayoutValues(): LayoutPresetValues {
    const baseline = readObsidianTypographyBaseline();
    const fontFamily = this.readCssVar("--font-editor")
      || this.readCssVar("--font-text-theme")
      || DEFAULT_SETTINGS.fontFamily;
    return normalizeLayoutPresetValues({
      fontFamily,
      headingFontFamily: fontFamily,
      quoteFontFamily: fontFamily,
      boldFontFamily: fontFamily,
      italicFontFamily: fontFamily,
      fontSize: baseline.fontSize,
      lineHeight: baseline.lineHeight,
      paragraphSpacing: 0,
      firstLineIndent: 0,
      contentWidth: this.captureObsidianContentWidthEm(baseline.fontSize),
      paperTheme: "plain",
      customPaperImage: "",
      justifyText: false,
    });
  }

  private captureObsidianContentWidthEm(fontSize: number): number {
    const raw = Number.parseFloat(this.readCssVar("--file-line-width"));
    if (
      !this.isReadableLineWidthEnabled()
      || !Number.isFinite(raw)
      || raw <= 0
      || fontSize <= 0
    ) return 72;
    return Math.min(72, Math.max(28, Math.round(raw / fontSize)));
  }

  private getLayoutPresetIdForFile(file: TFile | null): LayoutPresetId {
    if (!file) return this.settings.layoutPreset;
    return this.settings.documentLayouts[file.path]?.layoutPreset
      ?? this.getCssClassLayoutRuleForFile(file)?.layoutPreset
      ?? this.settings.layoutPreset;
  }

  private getFollowObsidianOverridesForFile(file: TFile | null): LayoutPresetOverrides {
    const documentLayout = file ? this.settings.documentLayouts[file.path] : undefined;
    if (documentLayout?.layoutPreset === "obsidian") {
      return documentLayout.obsidianOverrides ?? {};
    }
    return this.settings.obsidianOverrides;
  }

  private getCssClassLayoutRuleForFile(file: TFile | null): CssClassLayoutRule | null {
    if (!file) return null;
    return findCssClassLayoutRule(this.getCssClassesForFile(file), this.settings.cssClassLayoutRules);
  }

  private ensureDocumentLayoutForCssClass(file: TFile): DocumentLayoutSettings | undefined {
    const existing = this.settings.documentLayouts[file.path];
    if (existing) return existing;
    const rule = this.getCssClassLayoutRuleForFile(file);
    if (!rule) return undefined;
    const documentLayout: DocumentLayoutSettings = {
      layoutPreset: rule.layoutPreset,
      values: this.getLayoutSettingsForFile(file),
      obsidianOverrides: {},
    };
    this.settings.documentLayouts[file.path] = documentLayout;
    return documentLayout;
  }

  private applyLayoutVariables(
    target: HTMLElement,
    layout: LayoutPresetValues,
    followObsidian = false,
    overrides: LayoutPresetOverrides = {},
  ): void {
    for (const property of LAYOUT_CSS_VARIABLES) target.style.removeProperty(property);
    if (followObsidian) {
      // 不写任何原生基线的变量。仅对用户明确改过的字段生成对应变量，
      // 并由 cw-follow-override-* 选择器按字段覆盖。
      if (overrides.fontFamily !== undefined) target.style.setProperty("--cw-font-family", layout.fontFamily);
      if (overrides.headingFontFamily !== undefined) target.style.setProperty("--cw-heading-font-family", layout.headingFontFamily);
      if (overrides.quoteFontFamily !== undefined) target.style.setProperty("--cw-quote-font-family", layout.quoteFontFamily);
      if (overrides.boldFontFamily !== undefined) target.style.setProperty("--cw-bold-font-family", layout.boldFontFamily);
      if (overrides.italicFontFamily !== undefined) target.style.setProperty("--cw-italic-font-family", layout.italicFontFamily);
      if (overrides.fontSize !== undefined) target.style.setProperty("--cw-font-size", `${layout.fontSize}px`);
      if (overrides.lineHeight !== undefined) target.style.setProperty("--cw-line-height", `${layout.lineHeight}`);
      if (overrides.paragraphSpacing !== undefined) target.style.setProperty("--cw-paragraph-spacing", `${layout.paragraphSpacing}em`);
      if (overrides.firstLineIndent !== undefined) target.style.setProperty("--cw-first-line-indent", `${layout.firstLineIndent}em`);
      if (overrides.contentWidth !== undefined) target.style.setProperty("--cw-content-width", `${layout.contentWidth}em`);
      if (overrides.customPaperImage !== undefined) {
        const customPaperFile = this.app.vault.getAbstractFileByPath(layout.customPaperImage);
        const customPaperUrl = customPaperFile instanceof TFile
          ? this.app.vault.getResourcePath(customPaperFile)
          : "";
        target.style.setProperty(
          "--cw-paper-image",
          customPaperUrl ? `url("${customPaperUrl.replace(/["\\\n\r]/g, "\\$&")}")` : "none",
        );
      }
      return;
    }
    target.style.setProperty("--cw-font-family", layout.fontFamily);
    target.style.setProperty("--cw-heading-font-family", layout.headingFontFamily);
    target.style.setProperty("--cw-quote-font-family", layout.quoteFontFamily);
    target.style.setProperty("--cw-bold-font-family", layout.boldFontFamily);
    target.style.setProperty("--cw-italic-font-family", layout.italicFontFamily);
    target.style.setProperty("--cw-font-size", `${layout.fontSize}px`);
    target.style.setProperty("--cw-line-height", `${layout.lineHeight}`);
    target.style.setProperty("--cw-paragraph-spacing", `${layout.paragraphSpacing}em`);
    target.style.setProperty("--cw-first-line-indent", `${layout.firstLineIndent}em`);
    target.style.setProperty("--cw-content-width", `${layout.contentWidth}em`);
    const customPaperFile = this.app.vault.getAbstractFileByPath(layout.customPaperImage);
    const customPaperUrl = customPaperFile instanceof TFile
      ? this.app.vault.getResourcePath(customPaperFile)
      : "";
    target.style.setProperty(
      "--cw-paper-image",
      customPaperUrl
        ? `url("${customPaperUrl.replace(/["\\\n\r]/g, "\\$&")}")`
        : "none",
    );
  }

  private applySettings(): void {
    const root = document.documentElement;
    const interfaceAccentMode: InterfaceAccentMode = normalizeInterfaceAccentMode(
      this.settings.interfaceAccentMode,
    );
    const interfaceAccentColor = normalizeAccentColor(this.settings.interfaceAccentColor);
    this.settings.interfaceAccentMode = interfaceAccentMode;
    this.settings.interfaceAccentColor = interfaceAccentColor;
    root.style.setProperty(
      "--cw-panel-accent-resolved",
      interfaceAccentMode === "theme" ? "var(--interactive-accent)" : interfaceAccentColor,
    );
    root.style.setProperty(
      "--cw-panel-accent-contrast",
      interfaceAccentMode === "theme"
        ? "var(--text-on-accent, #ffffff)"
        : getAccentContrastColor(interfaceAccentColor),
    );
    // 正文变量只写入实际的 Markdown 视图；根节点不保留一份全局字体栈，
    // 这样任一笔记切到“跟随 Obsidian”时不会继承插件的残留变量。
    for (const property of LAYOUT_CSS_VARIABLES) root.style.removeProperty(property);
    const typewriterPosition = normalizeTypewriterCursorPosition(
      this.settings.typewriterCursorPosition,
    );
    this.settings.typewriterCursorPosition = typewriterPosition;
    root.style.setProperty("--cw-typewriter-position", `${typewriterPosition}`);
    root.style.setProperty(
      "--cw-typewriter-padding-start",
      `${Math.max(18, typewriterPosition - 8)}vh`,
    );
    root.style.setProperty(
      "--cw-typewriter-padding-end",
      `${Math.max(18, 92 - typewriterPosition)}vh`,
    );
    document.body.classList.toggle(
      "cw-diagnostics-off",
      !this.settings.showDiagnostics,
    );
    document.body.classList.toggle(
      "cw-typewriter-mode",
      this.settings.typewriterMode,
    );
    document.body.classList.toggle(
      "cw-highlight-current-line",
      this.settings.highlightCurrentLine,
    );
    const repositionTypewriter = shouldRepositionTypewriter(
      this.appliedTypewriterPosition,
      this.appliedTypewriterMode,
      typewriterPosition,
      this.settings.typewriterMode,
    );
    this.appliedTypewriterPosition = typewriterPosition;
    this.appliedTypewriterMode = this.settings.typewriterMode;
    if (repositionTypewriter) {
      document.dispatchEvent(new CustomEvent("cw-typewriter-position-change"));
    }
  }

  private removeGlobalStyles(): void {
    const root = document.documentElement;
    for (const property of [
      ...LAYOUT_CSS_VARIABLES,
      "--cw-typewriter-position",
      "--cw-typewriter-padding-start",
      "--cw-typewriter-padding-end",
      "--cw-panel-accent-resolved",
      "--cw-panel-accent-contrast",
    ]) {
      root.style.removeProperty(property);
    }
    document.body.classList.remove(
      "cw-diagnostics-off",
      "cw-ragged-text",
      "cw-typewriter-mode",
      "cw-highlight-current-line",
      "cw-focus-mode",
    );
  }

  private normalizeClasses(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof value === "string") {
      return value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  }

  private getCssClassesForFile(file: TFile): string[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return [];
    return [...new Set([
      ...this.normalizeClasses(frontmatter.cssclasses),
      ...this.normalizeClasses(frontmatter.cssclass),
    ])];
  }

  isNovelFile(file: TFile | null): boolean {
    if (!file) return false;
    return this.getCssClassesForFile(file).includes(this.settings.activationClass);
  }

  async toggleNovelMode(file: TFile, notify = true): Promise<void> {
    const wasEnabled = this.isNovelFile(file);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const classes = this.normalizeClasses(frontmatter.cssclasses);
      const legacyClasses = this.normalizeClasses(frontmatter.cssclass);
      const combined = [...new Set([...classes, ...legacyClasses])];
      const filtered = combined.filter(
        (className) => className !== this.settings.activationClass,
      );

      if (!wasEnabled) filtered.push(this.settings.activationClass);

      if (filtered.length > 0) {
        frontmatter.cssclasses = filtered;
      } else {
        delete frontmatter.cssclasses;
      }
      delete frontmatter.cssclass;
    });

    if (notify) new Notice(wasEnabled ? "已关闭写作模式" : "已开启写作模式");
    window.setTimeout(() => {
      this.syncAllViews();
      this.updateStatusBar();
      this.refreshWritingPanels();
    }, 50);
  }

  private syncAllViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const enabled = this.isNovelFile(view.file);
      const container = view.containerEl;
      const presetId = this.getLayoutPresetIdForFile(view.file);
      const followObsidian = presetId === "obsidian";
      const layout = this.getLayoutSettingsForFile(view.file);
      const overrides = followObsidian
        ? this.getFollowObsidianOverridesForFile(view.file)
        : {};
      this.applyLayoutVariables(container, layout, followObsidian, overrides);
      container.classList.toggle("cw-novel-enabled", enabled);
      container.classList.toggle("cw-follow-obsidian", enabled && followObsidian);
      for (const className of FOLLOW_OBSIDIAN_OVERRIDE_CLASSES) {
        container.classList.remove(className);
      }
      if (enabled && followObsidian) {
        for (const key of Object.keys(overrides) as Array<keyof LayoutPresetValues>) {
          container.classList.add(`cw-follow-override-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
        }
      }
      container.classList.toggle(
        "cw-ragged-text",
        enabled && (!layout.justifyText && (!followObsidian || overrides.justifyText !== undefined)),
      );
      for (const className of PAPER_CLASSES) container.classList.remove(className);
      if (enabled && (!followObsidian || overrides.paperTheme !== undefined)) {
        container.classList.add(`cw-paper-${layout.paperTheme}`);
      }
    }
  }

  private clearViewClasses(leaf: WorkspaceLeaf): void {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    view.containerEl.classList.remove(
      "cw-novel-enabled",
      "cw-ragged-text",
      "cw-follow-obsidian",
      ...FOLLOW_OBSIDIAN_OVERRIDE_CLASSES,
      ...PAPER_CLASSES,
    );
    for (const property of LAYOUT_CSS_VARIABLES) view.containerEl.style.removeProperty(property);
  }

  private scheduleStatusUpdate(): void {
    if (this.statusUpdateTimer !== undefined) {
      window.clearTimeout(this.statusUpdateTimer);
    }
    this.statusUpdateTimer = window.setTimeout(() => {
      this.updateStatusBar();
      this.refreshWritingPanels();
    }, 160);
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const enabled = this.isNovelFile(view?.file ?? null);
    this.statusBarItem.toggleClass(
      "cw-status-hidden",
      !this.settings.showStatusBar || !enabled,
    );
    if (!view || !enabled) return;

    const text = view.editor.getValue();
    const characterCount = countWritingCharacters(text);
    const issueCount = this.settings.showDiagnostics
      ? analyzeChineseText(text).length
      : 0;
    this.statusBarItem.setText(
      `正文 ${characterCount.toLocaleString()} 字符${
        this.settings.showDiagnostics ? ` · 提示 ${issueCount}` : ""
      }`,
    );
    this.statusBarItem.setAttribute(
      "title",
      "正文字符数不包含 YAML 和空白；提示不会自动修改正文。",
    );
  }

  private async cyclePaperTheme(): Promise<void> {
    const themes = PAPER_THEME_OPTIONS.map((option) => option.value);
    const layout = this.getCurrentLayoutSettings();
    const current = themes.indexOf(layout.paperTheme);
    const paperTheme = themes[(current + 1) % themes.length];
    this.markLayoutPresetEdited();
    this.previewLayoutSettings({ paperTheme });
    await this.commitSettings();
    const label = PAPER_THEME_OPTIONS.find(
      (option) => option.value === paperTheme,
    )?.label;
    new Notice(`纸张主题：${label ?? paperTheme}`);
  }

  getAvailablePaperImages(): TFile[] {
    const supportedExtensions = new Set([
      "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg",
    ]);
    return this.app.vault.getFiles()
      .filter((file) => supportedExtensions.has(file.extension.toLowerCase()))
      .sort((left, right) => left.path.localeCompare(
        right.path,
        "zh-CN",
        { numeric: true, sensitivity: "base" },
      ));
  }

  getWritingMarkdownView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) {
      this.lastMarkdownLeaf = active.leaf;
      return active;
    }
    const remembered = this.lastMarkdownLeaf?.view;
    return remembered instanceof MarkdownView ? remembered : null;
  }

  async openWritingPanel(setProfessionalMode = true): Promise<void> {
    const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (currentView) this.lastMarkdownLeaf = currentView.leaf;

    if (setProfessionalMode && this.settings.interfaceMode !== "professional") {
      this.settings.interfaceMode = "professional";
      await this.saveData(this.settings);
    }

    let leaf = this.app.workspace.getLeavesOfType(WRITING_PANEL_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: WRITING_PANEL_VIEW_TYPE,
        active: true,
      });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.refreshWritingPanels();
  }

  async setInterfaceMode(mode: InterfaceMode, notify = true): Promise<void> {
    this.settings.interfaceMode = mode;
    await this.saveData(this.settings);
    if (mode === "simple") {
      this.app.workspace.detachLeavesOfType(WRITING_PANEL_VIEW_TYPE);
    } else {
      await this.openWritingPanel(false);
    }
    if (notify) {
      new Notice(mode === "simple" ? "已切换到简洁版：使用左侧书本按钮" : "已切换到专业版：右侧写作工坊已打开");
    }
  }

  async toggleInterfaceMode(): Promise<void> {
    await this.setInterfaceMode(
      this.settings.interfaceMode === "simple" ? "professional" : "simple",
    );
  }

  async advanceWritingMode(): Promise<void> {
    const view = this.getWritingMarkdownView();
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }

    const novelEnabled = this.isNovelFile(view.file);
    if (!novelEnabled) {
      await this.setInterfaceMode("simple", false);
      await this.toggleNovelMode(view.file, false);
      new Notice("已开启写作模式（简洁版）");
      return;
    }

    if (this.settings.interfaceMode === "simple") {
      await this.setInterfaceMode("professional", false);
      new Notice("写作模式保持开启，已进入专业版");
      return;
    }

    await this.toggleNovelMode(view.file, false);
    await this.setInterfaceMode("simple", false);
    new Notice("已关闭写作模式，并回到简洁版");
  }

  async toggleTypewriterMode(): Promise<void> {
    this.settings.typewriterMode = !this.settings.typewriterMode;
    await this.saveAndApplySettings();

    const view = this.getWritingMarkdownView();
    if (view && this.settings.typewriterMode) {
      const cursor = view.editor.getCursor();
      view.editor.scrollIntoView({ from: cursor, to: cursor }, true);
    }
    new Notice(this.settings.typewriterMode ? "已开启打字机模式" : "已关闭打字机模式");
  }

  isFocusModeEnabled(): boolean {
    return this.focusModeEnabled;
  }

  toggleFocusMode(enabled = !this.focusModeEnabled, notify = true): void {
    this.focusModeEnabled = enabled;
    document.body.classList.toggle("cw-focus-mode", enabled);
    this.focusExitButton?.remove();
    this.focusExitButton = undefined;

    if (enabled) {
      const button = document.body.createEl("button", {
        cls: "cw-focus-exit",
        attr: {
          type: "button",
          "aria-label": "退出专注模式",
          title: "退出专注模式（Esc）",
        },
      });
      setIcon(button, "minimize-2");
      button.createSpan({ text: "退出专注" });
      button.addEventListener("click", () => this.toggleFocusMode(false));
      this.focusExitButton = button;
    }

    this.refreshWritingPanels();
    if (notify) new Notice(enabled ? "已进入专注模式，按 Esc 退出" : "已退出专注模式");
  }

  async exportCurrentNoteAsText(): Promise<void> {
    await this.exportCurrentNote("txt", false);
  }

  openExportModal(): void {
    if (!this.getWritingMarkdownView()?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    new ExportModal(this).open();
  }

  async exportCurrentNote(
    format: ExportFormat,
    openFolderAfterExport = this.settings.openFolderAfterExport,
  ): Promise<boolean> {
    return this.exportNotes({
      format,
      scope: "current",
      includeFileTitles: false,
      stripMarkdown: this.settings.stripMarkdownOnExport,
      openFolderAfterExport,
      wordTitlePage: this.settings.wordTitlePage,
      wordPageNumbers: this.settings.wordPageNumbers,
      wordHeader: this.settings.wordHeader,
    });
  }

  async exportNotes(request: ExportRequest): Promise<boolean> {
    const view = this.getWritingMarkdownView();
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return false;
    }

    const sources = await this.getExportSources(request.scope, view);
    const blocks = combineExportSources(
      sources,
      request.scope === "folder" && request.includeFileTitles,
      request.stripMarkdown,
    );
    const plainText = exportBlocksToPlainText(blocks);
    if (!plainText) {
      new Notice("所选范围没有可导出的正文");
      return false;
    }
    const layout = this.getLayoutSettingsForFile(view.file);

    try {
      await this.ensureExportFolder();
      const documentTitle = request.scope === "folder"
        ? `${view.file.parent?.name || this.app.vault.getName()}整稿`
        : view.file.basename;
      const pathExists = (path: string): boolean =>
        this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
      let noticePath = "";
      if (request.format === "docx") {
        const exportPath = getAvailableExportPath(documentTitle, pathExists, "docx");
        const data = createDocx(blocks, {
          fontFamily: layout.fontFamily,
          headingFontFamily: layout.headingFontFamily,
          fontSizePx: layout.fontSize,
          lineHeight: layout.lineHeight,
          paragraphSpacingEm: layout.paragraphSpacing,
          firstLineIndentEm: layout.firstLineIndent,
          documentTitle,
          includeTitlePage: request.wordTitlePage,
          includePageNumbers: request.wordPageNumbers,
          includeHeader: request.wordHeader,
        });
        await this.app.vault.createBinary(normalizePath(exportPath), data);
        noticePath = exportPath;
      } else if (request.format === "png") {
        const pages = await createPngPages(blocks, {
          fontFamily: layout.fontFamily,
          headingFontFamily: layout.headingFontFamily,
          fontSizePx: layout.fontSize,
          lineHeight: layout.lineHeight,
          paragraphSpacingEm: layout.paragraphSpacing,
          firstLineIndentEm: layout.firstLineIndent,
          paperTheme: layout.paperTheme,
        });
        const baseName = getAvailableExportBaseName(documentTitle, pathExists, "png");
        for (const [index, page] of pages.entries()) {
          const filename = pages.length === 1
            ? `${baseName}.png`
            : `${baseName}-第${index + 1}页.png`;
          await this.app.vault.createBinary(
            normalizePath(`${EXPORT_FOLDER}/${filename}`),
            page,
          );
        }
        noticePath = pages.length === 1
          ? `${EXPORT_FOLDER}/${baseName}.png`
          : `${EXPORT_FOLDER}/${baseName}-第1页.png 等 ${pages.length} 页`;
      } else {
        const exportPath = getAvailableExportPath(documentTitle, pathExists, "txt");
        await this.app.vault.create(normalizePath(exportPath), `${plainText}\n`);
        noticePath = exportPath;
      }

      this.settings.preferredExportFormat = request.format;
      this.settings.preferredExportScope = request.scope;
      this.settings.includeFileTitles = request.includeFileTitles;
      this.settings.stripMarkdownOnExport = request.stripMarkdown;
      this.settings.openFolderAfterExport = request.openFolderAfterExport;
      this.settings.wordTitlePage = request.wordTitlePage;
      this.settings.wordPageNumbers = request.wordPageNumbers;
      this.settings.wordHeader = request.wordHeader;
      await this.commitSettings();
      new Notice(`已导出：${noticePath}`);
      if (request.openFolderAfterExport) await this.openExportFolder();
      return true;
    } catch (error) {
      console.error("中文写作排版：导出失败", error);
      new Notice("导出失败，请确认“写作导出”路径可用");
      return false;
    }
  }

  private async getExportSources(
    scope: ExportScope,
    view: MarkdownView,
  ): Promise<ExportSource[]> {
    if (!view.file || scope === "current") {
      return view.file
        ? [{ title: view.file.basename, markdown: view.editor.getValue() }]
        : [];
    }
    const parentPath = view.file.parent?.path ?? "";
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => (file.parent?.path ?? "") === parentPath)
      .sort((left, right) => left.basename.localeCompare(
        right.basename,
        "zh-CN",
        { numeric: true, sensitivity: "base" },
      ));
    const sources: ExportSource[] = [];
    for (const file of files) {
      sources.push({
        title: file.basename,
        markdown: file.path === view.file.path
          ? view.editor.getValue()
          : await this.app.vault.cachedRead(file),
      });
    }
    return sources;
  }

  async openExportFolder(): Promise<void> {
    const folderPath = await this.ensureExportFolder();
    const adapter = this.app.vault.adapter;

    if (Platform.isDesktopApp && adapter instanceof FileSystemAdapter) {
      try {
        const electron = require("electron") as {
          shell: { openPath: (path: string) => Promise<string> };
        };
        const absolutePath = adapter.getFullPath(folderPath);
        const error = await electron.shell.openPath(absolutePath);
        if (!error) {
          await focusWindowsFolder(absolutePath);
          return;
        }
      } catch {
        // Fall through to Obsidian's file explorer when Electron is unavailable.
      }
    }

    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (leaf && folder) {
      await this.app.workspace.revealLeaf(leaf);
      const explorer = leaf.view as unknown as {
        revealInFolder?: (target: typeof folder) => Promise<void> | void;
      };
      await explorer.revealInFolder?.(folder);
      new Notice("已在 Obsidian 文件列表中定位到“写作导出”");
      return;
    }
    new Notice("导出文件夹位于仓库根目录：写作导出/");
  }

  async applyLayoutPreset(presetId: LayoutPresetId): Promise<void> {
    if (presetId === "obsidian") {
      const file = this.getWritingMarkdownView()?.file;
      const documentLayout = file ? this.ensureDocumentLayoutForCssClass(file) : undefined;
      if (documentLayout) {
        documentLayout.layoutPreset = "obsidian";
        documentLayout.obsidianOverrides = {};
      } else {
        this.settings.layoutPreset = "obsidian";
        this.settings.obsidianOverrides = {};
      }
      await this.saveAndApplySettings();
      new Notice("已应用跟随 Obsidian：正文保持 Obsidian 当前排版");
      return;
    }
    const values = getLayoutPresetValues(presetId, this.settings.customLayoutPresets);
    if (!values) {
      const file = this.getWritingMarkdownView()?.file;
      const documentLayout = file ? this.settings.documentLayouts[file.path] : undefined;
      if (documentLayout) documentLayout.layoutPreset = "custom";
      else this.settings.layoutPreset = "custom";
      await this.commitSettings();
      return;
    }
    const normalized = normalizeLayoutPresetValues(values);
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCssClass(file) : undefined;
    if (documentLayout) {
      documentLayout.values = normalized;
      documentLayout.layoutPreset = presetId;
    } else {
      Object.assign(this.settings, normalized);
      this.settings.layoutPreset = presetId;
    }
    await this.saveAndApplySettings();
    new Notice(presetId === "default" ? "已应用推荐写作版式" : "已应用自定义版式模板");
  }

  async resetLayoutSettings(): Promise<void> {
    await this.applyLayoutPreset("default");
  }

  async saveCustomLayoutPreset(name: string, existingId?: string): Promise<string> {
    const id = existingId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const preset: CustomLayoutPreset = {
      id,
      name: name.trim() || "自定义版式",
      values: normalizeLayoutPresetValues(this.getCurrentLayoutSettings()),
    };
    const index = this.settings.customLayoutPresets.findIndex((item) => item.id === id);
    if (index >= 0) this.settings.customLayoutPresets[index] = preset;
    else this.settings.customLayoutPresets.push(preset);
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCssClass(file) : undefined;
    if (documentLayout) documentLayout.layoutPreset = `saved:${id}`;
    else this.settings.layoutPreset = `saved:${id}`;
    await this.commitSettings();
    new Notice(existingId ? `已更新版式模板：${preset.name}` : `已保存版式模板：${preset.name}`);
    return id;
  }

  async deleteCustomLayoutPreset(id: string): Promise<void> {
    const preset = this.settings.customLayoutPresets.find((item) => item.id === id);
    this.settings.customLayoutPresets = this.settings.customLayoutPresets.filter(
      (item) => item.id !== id,
    );
    if (this.settings.layoutPreset === `saved:${id}`) this.settings.layoutPreset = "custom";
    for (const layout of Object.values(this.settings.documentLayouts)) {
      if (layout.layoutPreset === `saved:${id}`) layout.layoutPreset = "custom";
    }
    for (const rule of this.settings.cssClassLayoutRules) {
      if (rule.layoutPreset === `saved:${id}`) rule.layoutPreset = "default";
    }
    await this.saveAndApplySettings();
    if (preset) new Notice(`已删除版式模板：${preset.name}`);
  }

  openFormattingModal(editor?: Editor): void {
    const targetEditor = editor ?? this.getWritingMarkdownView()?.editor;
    if (!targetEditor) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    new FormattingModal(this, targetEditor).open();
  }

  async saveCustomFormattingPreset(
    name: string,
    rules: FormattingRules,
    ruleOrder: readonly FormattingRuleKey[],
    existingId?: string,
  ): Promise<string> {
    const id = existingId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const preset: CustomFormattingPreset = {
      id,
      name: name.trim() || "自定义方案",
      rules: { ...rules },
      ruleOrder: normalizeRuleOrder(ruleOrder),
    };
    const index = this.settings.customFormattingPresets.findIndex((item) => item.id === id);
    if (index >= 0) this.settings.customFormattingPresets[index] = preset;
    else this.settings.customFormattingPresets.push(preset);
    this.settings.formattingPreset = `saved:${id}`;
    this.settings.formattingRules = { ...rules };
    this.settings.formattingRuleOrder = [...preset.ruleOrder];
    await this.commitSettings();
    new Notice(existingId ? `已更新排版方案：${preset.name}` : `已保存排版方案：${preset.name}`);
    return id;
  }

  async deleteCustomFormattingPreset(id: string): Promise<void> {
    const preset = this.settings.customFormattingPresets.find((item) => item.id === id);
    this.settings.customFormattingPresets = this.settings.customFormattingPresets.filter(
      (item) => item.id !== id,
    );
    if (this.settings.formattingPreset === `saved:${id}`) {
      this.settings.formattingPreset = "novel";
      this.settings.formattingRules = { ...DEFAULT_FORMATTING_RULES };
      this.settings.formattingRuleOrder = normalizeRuleOrder(undefined);
    }
    await this.commitSettings();
    if (preset) new Notice(`已删除排版方案：${preset.name}`);
  }

  async applyFormatting(
    editor: Editor,
    rules: FormattingRules,
    preset: FormattingPresetId,
    saveAsDefault = true,
    ruleOrder: readonly FormattingRuleKey[] = this.settings.formattingRuleOrder,
  ): Promise<void> {
    const scrollInfo = editor.getScrollInfo();
    const hasSelection = editor.somethingSelected();
    const source = hasSelection ? editor.getSelection() : editor.getValue();
    const normalizedOrder = normalizeRuleOrder(ruleOrder);
    const formatted = applyFormattingRules(source, rules, normalizedOrder);

    if (formatted === source) {
      new Notice("文本已经符合所选排版规则");
      if (saveAsDefault) {
        this.settings.formattingPreset = preset;
        this.settings.formattingRules = { ...rules };
        this.settings.formattingRuleOrder = [...normalizedOrder];
        await this.commitSettings();
      }
      this.restoreEditorScroll(editor, scrollInfo.left, scrollInfo.top);
      return;
    }

    if (hasSelection) {
      const from = editor.getCursor("from");
      const startOffset = editor.posToOffset(from);
      editor.replaceSelection(formatted, "chinese-writing-layout");
      editor.setSelection(from, editor.offsetToPos(startOffset + formatted.length));
    } else {
      const cursorOffset = editor.posToOffset(editor.getCursor());
      const formattedPrefixLength = applyFormattingRules(
        source.slice(0, cursorOffset),
        rules,
        normalizedOrder,
      ).length;
      const end = {
        line: editor.lastLine(),
        ch: editor.getLine(editor.lastLine()).length,
      };
      editor.replaceRange(
        formatted,
        { line: 0, ch: 0 },
        end,
        "chinese-writing-layout",
      );
      editor.setCursor(editor.offsetToPos(Math.min(formattedPrefixLength, formatted.length)));
    }

    if (saveAsDefault) {
      this.settings.formattingPreset = preset;
      this.settings.formattingRules = { ...rules };
      this.settings.formattingRuleOrder = [...normalizedOrder];
      await this.commitSettings();
    }
    this.scheduleStatusUpdate();
    this.restoreEditorScroll(editor, scrollInfo.left, scrollInfo.top);
    new Notice(hasSelection ? "已排版所选文字，可按 Ctrl+Z 撤销" : "已排版整篇笔记，可按 Ctrl+Z 撤销");
  }

  private restoreEditorScroll(editor: Editor, left: number, top: number): void {
    // replaceRange / setSelection 会让 CodeMirror 重新测量并可能跳回文首。
    // 连续两帧后恢复，确保文档变更与面板刷新都已完成。
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => editor.scrollTo(left, top));
    });
  }

  private async applyQuickFormatting(
    editor: Editor,
    patch: Partial<FormattingRules>,
  ): Promise<void> {
    const rules = { ...createDisabledFormattingRules(), ...patch };
    await this.applyFormatting(
      editor,
      rules,
      "custom",
      false,
      normalizeRuleOrder(undefined),
    );
  }

  private async ensureExportFolder(): Promise<string> {
    const exportFolder = normalizePath(EXPORT_FOLDER);
    if (!this.app.vault.getAbstractFileByPath(exportFolder)) {
      await this.app.vault.createFolder(exportFolder);
    }
    return exportFolder;
  }

  async revealDiagnostic(diagnostic: TextDiagnostic): Promise<void> {
    const view = this.getWritingMarkdownView();
    if (!view) return;
    const from = view.editor.offsetToPos(diagnostic.from);
    const to = view.editor.offsetToPos(diagnostic.to);
    await this.app.workspace.revealLeaf(view.leaf);
    view.editor.setSelection(from, to);
    view.editor.scrollIntoView({ from, to }, true);
    view.editor.focus();
  }

  private refreshWritingPanels(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(WRITING_PANEL_VIEW_TYPE)) {
      if (leaf.view instanceof WritingPanelView) leaf.view.refresh();
    }
  }
}
