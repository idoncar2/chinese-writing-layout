import {
  type Editor,
  FileSystemAdapter,
  getAllTags,
  MarkdownView,
  Notice,
  normalizePath,
  Platform,
  Plugin,
  setIcon,
  TFile,
  TFolder,
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
import { applyFormattingPipeline } from "./formatting-pipeline";
import {
  canRestoreBatchSnapshot,
  type BatchFormattingRequest,
  type BatchFormattingResult,
  type BatchFormattingUndoResult,
  type BatchFormattingUndoState,
} from "./formatting-batch";
import { FormattingBatchModal } from "./formatting-batch-modal";
import { FormattingModal } from "./formatting-modal";
import {
  type FontPickerUserFontActions,
} from "./font-options";
import {
  createLongImagePlan,
  getImageExportDeviceBudget,
  renderLongImageSegment,
  yieldLongImageExport,
  type LongImagePlan,
} from "./image-export";
import {
  applySavedLayoutPresetSnapshot,
  captureLayoutPreset,
  clearFollowObsidianFontOverrides,
  getEditedLayoutPresetId,
  getLayoutPresetValues,
  hasLayoutPresetOverrides,
  normalizeCssClassLayoutRules,
  normalizeLayoutPresetId,
  normalizeLayoutPresetOverrides,
  normalizeLayoutPresetValues,
} from "./layout-presets";
import {
  cloneLayoutHistorySnapshot,
  isGlobalLayoutHistorySnapshot,
  isDocumentLayoutHistorySnapshot,
  LayoutHistoryManager,
  type LayoutChangeMeta,
  type LayoutChangeRecord,
  type LayoutHistorySnapshot,
} from "./layout-history";
import {
  getAvailableLocalExportPath,
  getAvailableLocalImageExportTarget,
  getLocalExportDirectory,
  joinLocalExportPath,
} from "./local-export";
import { deletePathKeys, remapPathKeys, remapVaultPath } from "./file-matching";
import {
  OBSIDIAN_NATIVE_FONT_FAMILY,
  normalizeObsidianFontFamily,
  readObsidianHeadingSizes,
  readObsidianTypographyBaseline,
  type HeadingSizeKey,
} from "./obsidian-baseline";
import {
  describeRenderedContentWidth,
  type RenderedContentWidth,
} from "./obsidian-content-width";
import { syncReadingProseLines } from "./reading-view-lines";
import { resolveRecommendedFontName } from "./quick-fonts";
import { ChineseWritingSettingTab } from "./settings";
import { SettingsSaveQueue } from "./settings-save-queue";
import { selectMarkdownView } from "./markdown-view-selection";
import {
  countUserFontReferences,
  fontSelectionToLegacyFontFamily,
  normalizeFontSelections,
  normalizeFontSettings,
  repairFontSelectionsAfterUserFontDeletion,
} from "./font-selection";
import {
  createUserFontId,
  createUserFontMetadata,
  getUserFontDirectory as resolveUserFontDirectory,
  getUserFontFilePath,
} from "./user-fonts";
import { getVaultFolderPath } from "./system-folder";
import {
  analyzeChineseText,
  countWritingText,
} from "./text-analysis";
import {
  DEFAULT_FORMATTING_RULES,
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
  DEFAULT_MARKDOWN_REPAIR_OPTIONS,
  DEFAULT_SETTINGS,
  HEADING_LEVELS,
  PAPER_THEME_OPTIONS,
  type AutoApplyRule,
  type ChineseWritingSettings,
  type CustomFormattingPreset,
  type CustomLayoutPreset,
  type DocumentLayoutSettings,
  type DocumentWritingMode,
  type ExportFormat,
  type ExportScope,
  type FontSelection,
  type ImageExportWidth,
  type FormattingPresetId,
  type FormattingRuleKey,
  type FormattingRules,
  type InterfaceAccentMode,
  type InterfaceMode,
  type LayoutPresetId,
  type LayoutPresetOverrides,
  type LayoutPresetValues,
  type UserFont,
  normalizeTypewriterCursorPosition,
  normalizeMarkdownFormattingOptions,
  normalizeHeadingLevels,
  normalizeImageExportWidth,
  normalizePaperTheme,
  type MarkdownFormattingOptions,
  shouldRepositionTypewriter,
} from "./types";
import {
  getEffectiveTypewriterMode,
  planTypewriterToggle,
  type TypewriterRuntimeState,
} from "./typewriter-runtime";
import {
  getAccentContrastColor,
  normalizeAccentColor,
  normalizeInterfaceAccentMode,
} from "./ui-theme";
import type { TextDiagnostic } from "./text-analysis";
import {
  getAvailableExportBaseName,
  getAvailableExportPath,
  prepareExportContent as prepareExportContentFromSources,
  sanitizeExportName,
  type ExportContentOptions,
  type PreparedExportContent,
  type ExportSource,
} from "./text-export";
import {
  WRITING_PANEL_VIEW_TYPE,
  WritingPanelView,
} from "./writing-panel";
import {
  normalizeWritingModeSettings,
  resolveWritingContext,
  type ResolvedWritingContext,
  type WritingFileFacts,
} from "./writing-mode";

const PAPER_CLASSES = PAPER_THEME_OPTIONS.map((option) => `cw-paper-${option.value}`);
const EXPORT_FOLDER = "写作导出";
const MOBILE_IMAGE_LAYOUT_VIEWPORT_WIDTH = 360;
const LAYOUT_CSS_VARIABLES = [
  "--cw-font-family",
  "--cw-heading-font-family",
  "--cw-quote-font-family",
  "--cw-bold-font-family",
  "--cw-italic-font-family",
  "--cw-font-size",
  "--cw-line-height",
  "--cw-letter-spacing",
  "--cw-paragraph-spacing",
  "--cw-first-line-indent",
  "--cw-content-width",
  "--cw-left-margin",
  "--cw-right-margin",
  "--cw-paper-image",
  "--cw-h1-size",
  "--cw-h2-size",
  "--cw-h3-size",
  "--cw-h4-size",
  "--cw-h5-size",
  "--cw-h6-size",
  "--cw-inline-title-size",
] as const;
const FOLLOW_OBSIDIAN_OVERRIDE_CLASSES = [
  "cw-follow-override-font-family",
  "cw-follow-override-heading-font-family",
  "cw-follow-override-quote-font-family",
  "cw-follow-override-bold-font-family",
  "cw-follow-override-italic-font-family",
  "cw-follow-override-font-size",
  "cw-follow-override-line-height",
  "cw-follow-override-letter-spacing",
  "cw-follow-override-paragraph-spacing",
  "cw-follow-override-first-line-indent",
  "cw-follow-override-content-width",
  "cw-follow-override-left-margin",
  "cw-follow-override-right-margin",
  "cw-follow-override-paper-theme",
  "cw-follow-override-custom-paper-image",
  "cw-follow-override-justify-text",
] as const;
const HEADING_CENTER_CLASSES = HEADING_LEVELS.map((level) => `cw-heading-center-h${level}`);
const FOCUS_CONTENT_WIDTH_VARIABLE = "--cw-focus-content-width";
const LEGACY_DEFAULT_FONT_FAMILY =
  '"Noto Serif CJK SC", "Source Han Serif SC", "思源宋体", "宋体", serif';

interface ExportRequest extends ExportContentOptions {
  openFolderAfterExport: boolean;
  wordTitlePage: boolean;
  wordPageNumbers: boolean;
  wordHeader: boolean;
  imageExportWidth?: ImageExportWidth;
  longImagePlan?: LongImagePlan;
  preparedContent?: PreparedExportContent;
  onProgress?: (current: number, total: number) => void;
}

export default class ChineseWritingLayoutPlugin extends Plugin {
  settings: ChineseWritingSettings = { ...DEFAULT_SETTINGS };
  private readonly settingsSaveQueue = new SettingsSaveQueue();
  private readonly layoutHistory = new LayoutHistoryManager();
  private pendingLayoutHistoryTargetKey?: string;
  private isRestoringLayoutHistory = false;
  private statusBarItem?: HTMLElement;
  private statusUpdateTimer?: number;
  private startupMarkdownSyncTimer?: number;
  private lastMarkdownLeaf?: WorkspaceLeaf;
  private lastLocalExportDirectory?: string;
  private lastBatchFormattingUndo?: BatchFormattingUndoState;
  private readonly loadedUserFontFaces = new Map<string, FontFace>();
  private readonly availableUserFontIds = new Set<string>();
  private focusModeEnabled = false;
  private focusExitButton?: HTMLButtonElement;
  private appliedTypewriterPosition?: number;
  private appliedTypewriterMode = false;
  private autoTypewriterSuppressedPath?: string;
  private lastAutoTypewriterWritingPath?: string;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.loadUserFonts();
    this.addSettingTab(new ChineseWritingSettingTab(this.app, this));
    this.registerEditorExtension(createWritingEditorExtension());
    this.registerMarkdownPostProcessor((element, context) => {
      const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
      syncReadingProseLines(
        element,
        file instanceof TFile && this.isNovelFile(file),
      );
    });
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
      id: "follow-writing-mode-rules-current-note",
      name: "当前笔记恢复跟随自动规则",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || !this.settings.documentWritingModes[view.file.path]) return false;
        if (!checking) void this.clearCurrentDocumentWritingMode();
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
      name: "打开最近的本地导出文件夹",
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
        this.refreshWritingPanels();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        const view = this.getWritingMarkdownView();
        if (view) this.lastMarkdownLeaf = view.leaf;
        this.syncAllViews();
        this.scheduleStatusUpdate();
        this.refreshWritingPanels();
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
        this.layoutHistory.renameDocumentPathPrefix(oldPath, file.path);
        let settingsChanged = this.hasStoredDocumentPath(oldPath);
        if (settingsChanged) {
          this.settings.documentLayouts = remapPathKeys(
            this.settings.documentLayouts,
            oldPath,
            file.path,
          );
          this.settings.documentWritingModes = remapPathKeys(
            this.settings.documentWritingModes,
            oldPath,
            file.path,
          );
        }
        if (file instanceof TFolder) {
          for (const rule of this.settings.autoApplyRules) {
            if (rule.kind !== "folder") continue;
            const folderPath = remapVaultPath(rule.folderPath, oldPath, file.path);
            if (folderPath === rule.folderPath) continue;
            rule.folderPath = folderPath;
            settingsChanged = true;
          }
        }
        if (settingsChanged) void this.enqueueSettingsSave();
        this.syncAllViews();
        this.refreshWritingPanels();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.layoutHistory.clearDocumentPathPrefix(file.path);
        if (this.hasStoredDocumentPath(file.path)) {
          this.settings.documentLayouts = deletePathKeys(
            this.settings.documentLayouts,
            file.path,
          );
          this.settings.documentWritingModes = deletePathKeys(
            this.settings.documentWritingModes,
            file.path,
          );
          void this.enqueueSettingsSave();
        }
        this.syncAllViews();
        this.refreshWritingPanels();
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      const activeView = this.getWritingMarkdownView();
      if (activeView) this.lastMarkdownLeaf = activeView.leaf;
      this.applySettings();
      this.syncAllViews();
      this.updateStatusBar();
      this.refreshWritingPanels();
      if (this.settings.interfaceMode === "simple") {
        this.app.workspace.detachLeavesOfType(WRITING_PANEL_VIEW_TYPE);
      }
      this.scheduleStartupMarkdownSync();
    });
  }

  onunload(): void {
    if (this.statusUpdateTimer !== undefined) {
      window.clearTimeout(this.statusUpdateTimer);
    }
    if (this.startupMarkdownSyncTimer !== undefined) {
      window.clearTimeout(this.startupMarkdownSyncTimer);
    }
    this.removeGlobalStyles();
    this.unloadUserFonts();
    this.toggleFocusMode(false, false);
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      this.clearViewClasses(leaf);
    }
    this.app.workspace.detachLeavesOfType(WRITING_PANEL_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const loadedData = await this.loadData();
    const stored = loadedData && typeof loadedData === "object"
      ? loadedData as Partial<ChineseWritingSettings>
      : null;
    const hasLegacyFontPresets = stored !== null
      && Object.prototype.hasOwnProperty.call(stored, "customFontPresets");
    const storedForSettings = stored
      ? Object.fromEntries(
        Object.entries(stored).filter(([key]) => key !== "customFontPresets"),
      ) as Partial<ChineseWritingSettings>
      : null;
    const normalizedStoredFontValues = storedForSettings
      ? {
        ...storedForSettings,
        fontFamily: storedForSettings.fontFamily === LEGACY_DEFAULT_FONT_FAMILY
          ? DEFAULT_SETTINGS.fontFamily
          : storedForSettings.fontFamily,
        headingFontFamily: storedForSettings.headingFontFamily === LEGACY_DEFAULT_FONT_FAMILY
          ? DEFAULT_SETTINGS.headingFontFamily
          : storedForSettings.headingFontFamily,
        specialFontFamily: storedForSettings.specialFontFamily === LEGACY_DEFAULT_FONT_FAMILY
          ? DEFAULT_SETTINGS.specialFontFamily
          : storedForSettings.specialFontFamily,
      }
      : null;
    const normalizedFontSettings = normalizeFontSettings(normalizedStoredFontValues);
    const customFormattingPresets = (stored?.customFormattingPresets ?? []).map(
      (preset): CustomFormattingPreset => ({
        ...preset,
        rules: {
          ...DEFAULT_FORMATTING_RULES,
          ...(preset.rules ?? {}),
        },
        ruleOrder: normalizeRuleOrder(preset.ruleOrder),
        markdownFormatting: normalizeMarkdownFormattingOptions(preset.markdownFormatting),
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
    const writingModeSettings = normalizeWritingModeSettings(
      stored,
      customLayoutPresets,
    );
    const normalizedStoredLayout = normalizeLayoutPresetValues(normalizedStoredFontValues);
    const fontFamily = normalizedStoredLayout.fontFamily;
    const legacySpecialFontFamily = normalizeObsidianFontFamily(
      normalizedStoredFontValues?.specialFontFamily,
      fontFamily,
    );
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(storedForSettings ?? {}),
      formattingRules: {
        ...DEFAULT_FORMATTING_RULES,
        ...(stored?.formattingRules ?? {}),
      },
      formattingRuleOrder: normalizeRuleOrder(stored?.formattingRuleOrder),
      markdownFormatting: normalizeMarkdownFormattingOptions(stored?.markdownFormatting),
      customFormattingPresets,
      userFonts: normalizedFontSettings.userFonts,
      layoutPreset: normalizeLayoutPresetId(
        stored?.layoutPreset ?? (stored ? "custom" : "default"),
        customLayoutPresets,
      ),
      obsidianOverrides: normalizeLayoutPresetOverrides(stored?.obsidianOverrides),
      customLayoutPresets,
      documentLayouts,
      cssClassLayoutRules,
      imageExportWidth: normalizeImageExportWidth(stored?.imageExportWidth),
      settingsSchemaVersion: Math.max(
        writingModeSettings.settingsSchemaVersion,
        normalizedFontSettings.settingsSchemaVersion,
      ),
      defaultWritingModeEnabled: writingModeSettings.defaultWritingModeEnabled,
      autoApplyRules: writingModeSettings.autoApplyRules,
      documentWritingModes: writingModeSettings.documentWritingModes,
      autoTypewriterOnWritingMode: writingModeSettings.autoTypewriterOnWritingMode,
      bodyFont: normalizedFontSettings.bodyFont,
      headingFont: normalizedFontSettings.headingFont,
      quoteFont: normalizedFontSettings.quoteFont,
      boldFont: normalizedFontSettings.boldFont,
      italicFont: normalizedFontSettings.italicFont,
      fontFamily,
      headingFontFamily: normalizedStoredLayout.headingFontFamily,
      specialFontFamily: legacySpecialFontFamily,
      quoteFontFamily: normalizedStoredLayout.quoteFontFamily,
      boldFontFamily: normalizedStoredLayout.boldFontFamily,
      italicFontFamily: normalizedStoredLayout.italicFontFamily,
      leftMargin: normalizedStoredLayout.leftMargin,
      rightMargin: normalizedStoredLayout.rightMargin,
      letterSpacing: normalizedStoredLayout.letterSpacing,
      contentWidthPx: normalizedStoredLayout.contentWidthPx,
      paperTheme: normalizePaperTheme(stored?.paperTheme),
      centerHeadings: typeof stored?.centerHeadings === "boolean"
        ? stored.centerHeadings
        : DEFAULT_SETTINGS.centerHeadings,
      centerHeadingLevels: normalizeHeadingLevels(stored?.centerHeadingLevels),
      countMode: stored?.countMode === "body-characters"
        ? "body-characters"
        : "creative",
      interfaceAccentMode: normalizeInterfaceAccentMode(stored?.interfaceAccentMode),
      interfaceAccentColor: normalizeAccentColor(stored?.interfaceAccentColor),
      typewriterCursorPosition: normalizeTypewriterCursorPosition(
        stored?.typewriterCursorPosition,
      ),
    };
    if (writingModeSettings.changed || normalizedFontSettings.changed || hasLegacyFontPresets) {
      await this.enqueueSettingsSave();
    }
  }

  getUserFontDirectory(): string {
    return resolveUserFontDirectory(
      this.manifest.dir,
      this.app.vault.configDir,
      this.manifest.id,
    );
  }

  getAvailableUserFontIds(): ReadonlySet<string> {
    return this.availableUserFontIds;
  }

  getFontPickerUserFontActions(): FontPickerUserFontActions {
    return {
      getUserFonts: () => this.settings.userFonts,
      getAvailableUserFontIds: () => this.getAvailableUserFontIds(),
      getFontUsageCount: (id) => this.getUserFontUsageCount(id),
      importFont: (file) => this.importUserFont(file),
      renameFont: (id, name) => this.renameUserFont(id, name),
      deleteFont: (id) => this.deleteUserFont(id),
    };
  }

  private async loadUserFonts(): Promise<void> {
    this.unloadUserFonts();
    if (this.settings.userFonts.length === 0) return;

    const missing: string[] = [];
    const unavailable: string[] = [];
    if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") {
      missing.push(...this.settings.userFonts.map((font) => font.name));
    } else {
      const adapter = this.app.vault.adapter;
      const directory = this.getUserFontDirectory();
      const fontSet = document.fonts as unknown as {
        add: (fontFace: FontFace) => void;
        delete: (fontFace: FontFace) => boolean;
      };
      for (const font of this.settings.userFonts) {
        const path = getUserFontFilePath(directory, font.fileName);
        try {
          if (!(await adapter.exists(path))) {
            missing.push(font.name);
            continue;
          }
          const binary = await adapter.readBinary(path);
          const face = new FontFace(font.id, binary);
          await face.load();
          fontSet.add(face);
          this.loadedUserFontFaces.set(font.id, face);
          this.availableUserFontIds.add(font.id);
        } catch {
          unavailable.push(font.name);
        }
      }
    }

    if (missing.length > 0 || unavailable.length > 0) {
      const names = [...missing, ...unavailable];
      new Notice(
        `字体文件暂时不可用：${names.join("、")}。设置仍会保留，文件恢复后可自动重新加载。`,
      );
    }
  }

  private unloadUserFonts(): void {
    if (typeof document !== "undefined" && document.fonts) {
      const fontSet = document.fonts as unknown as {
        delete: (fontFace: FontFace) => boolean;
      };
      for (const face of this.loadedUserFontFaces.values()) fontSet.delete(face);
    }
    this.loadedUserFontFaces.clear();
    this.availableUserFontIds.clear();
  }

  private async ensureUserFontDirectory(directory: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(directory))) await adapter.mkdir(directory);
  }

  async importUserFont(file: File): Promise<UserFont | null> {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const id = createUserFontId(this.settings.userFonts.map((font) => font.id), token);
    const metadata = createUserFontMetadata(file.name, id);
    if (!metadata) {
      new Notice("请选择 .ttf、.otf、.woff 或 .woff2 字体文件");
      return null;
    }

    const directory = this.getUserFontDirectory();
    const path = getUserFontFilePath(directory, metadata.fileName);
    const adapter = this.app.vault.adapter;
    let binary: ArrayBuffer;
    try {
      binary = await file.arrayBuffer();
      if (binary.byteLength === 0) throw new Error("Empty font file");
      await this.ensureUserFontDirectory(directory);
      await adapter.writeBinary(path, binary);
    } catch (error) {
      console.error("中文写作排版：导入字体失败", error);
      new Notice("字体导入失败，请确认文件可读且格式正确");
      return null;
    }

    const previousFonts = this.settings.userFonts;
    this.settings.userFonts = [...previousFonts, metadata];
    try {
      await this.enqueueSettingsSave();
    } catch (error) {
      this.settings.userFonts = previousFonts;
      try {
        await adapter.remove(path);
      } catch {
        // Keep the orphaned binary recoverable; it is not referenced by data.json.
      }
      console.error("中文写作排版：保存字体信息失败", error);
      new Notice("字体信息保存失败，未完成导入");
      return null;
    }

    await this.loadUserFonts();
    this.refreshWritingPanels();
    new Notice(`已导入字体：${metadata.name}`);
    return metadata;
  }

  async renameUserFont(id: string, name: string): Promise<boolean> {
    const font = this.settings.userFonts.find((item) => item.id === id);
    const normalizedName = name.trim();
    if (!font) return false;
    if (!normalizedName) {
      new Notice("字体显示名称不能为空");
      return false;
    }
    const previousName = font.name;
    font.name = normalizedName;
    try {
      await this.enqueueSettingsSave();
    } catch (error) {
      font.name = previousName;
      console.error("中文写作排版：重命名字体失败", error);
      new Notice("字体重命名失败");
      return false;
    }
    this.refreshWritingPanels();
    new Notice(`已重命名字体：${normalizedName}`);
    return true;
  }

  getUserFontUsageCount(id: string): number {
    let count = countUserFontReferences(this.settings, id);
    for (const preset of this.settings.customLayoutPresets) {
      count += countUserFontReferences(preset.values, id);
    }
    for (const layout of Object.values(this.settings.documentLayouts)) {
      count += countUserFontReferences(layout.values, id);
      count += countUserFontReferences(layout.obsidianOverrides, id);
    }
    count += countUserFontReferences(this.settings.obsidianOverrides, id);
    return count;
  }

  async deleteUserFont(id: string): Promise<boolean> {
    const font = this.settings.userFonts.find((item) => item.id === id);
    if (!font) return false;

    const adapter = this.app.vault.adapter;
    const path = getUserFontFilePath(this.getUserFontDirectory(), font.fileName);
    let binary: ArrayBuffer | undefined;
    try {
      if (await adapter.exists(path)) binary = await adapter.readBinary(path);
      if (binary) await adapter.remove(path);
    } catch (error) {
      console.error("中文写作排版：删除字体文件失败", error);
      new Notice("字体文件删除失败，未修改字体设置");
      return false;
    }

    const previousSettings = JSON.stringify(this.settings);
    try {
      this.settings.userFonts = this.settings.userFonts.filter((item) => item.id !== id);
      this.repairUserFontReferencesAfterDeletion(id);
      await this.enqueueSettingsSave();
    } catch (error) {
      try {
        this.settings = JSON.parse(previousSettings) as ChineseWritingSettings;
        if (binary) await adapter.writeBinary(path, binary);
        await this.enqueueSettingsSave();
      } catch {
        // The original settings and file are still the best available recovery path.
      }
      console.error("中文写作排版：保存删除字体后的设置失败", error);
      new Notice("字体删除失败，已尽量恢复原设置");
      return false;
    }

    await this.loadUserFonts();
    this.applySettings();
    this.syncAllViews();
    this.updateStatusBar();
    this.refreshWritingPanels();
    new Notice(`已删除字体：${font.name}`);
    return true;
  }

  private repairUserFontReferencesAfterDeletion(deletedId: string): void {
    const fontRoles = [
      ["bodyFont", "fontFamily", "body"],
      ["headingFont", "headingFontFamily", "heading"],
      ["quoteFont", "quoteFontFamily", "quote"],
      ["boldFont", "boldFontFamily", "bold"],
      ["italicFont", "italicFontFamily", "italic"],
    ] as const;
    const repairValues = (
      values: Partial<LayoutPresetValues> & { specialFontFamily?: unknown },
      followObsidian: boolean,
    ): void => {
      const current = normalizeFontSelections(values, { missingHeading: "default" });
      const repaired = repairFontSelectionsAfterUserFontDeletion(current, deletedId);
      const target = values as Record<string, unknown>;
      for (const [selectionKey, legacyKey, role] of fontRoles) {
        const before = current[selectionKey];
        if (before.source !== "user" || before.id !== deletedId) continue;
        const after = repaired[selectionKey];
        if (followObsidian) {
          delete target[selectionKey];
          delete target[legacyKey];
        } else {
          target[selectionKey] = after;
          target[legacyKey] = fontSelectionToLegacyFontFamily(after, role);
        }
      }
    };

    const legacySpecialFont = this.settings.specialFontFamily;
    repairValues(this.settings, false);
    for (const preset of this.settings.customLayoutPresets) {
      repairValues(preset.values, false);
    }
    for (const layout of Object.values(this.settings.documentLayouts)) {
      repairValues(layout.values, false);
      if (layout.obsidianOverrides) repairValues(layout.obsidianOverrides, true);
    }
    repairValues(this.settings.obsidianOverrides, true);
    if (legacySpecialFont.includes(deletedId)) {
      this.settings.specialFontFamily = this.settings.fontFamily;
    }
  }

  private enqueueSettingsSave(): Promise<void> {
    return this.settingsSaveQueue.enqueue(() => this.saveData(this.settings));
  }

  async saveAndApplySettings(refreshPanels = true): Promise<void> {
    await this.enqueueSettingsSave();
    this.applySettings();
    this.syncAllViews();
    this.updateStatusBar();
    if (refreshPanels) this.refreshWritingPanels();
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
    if (this.settings.layoutPreset === "default") {
      return this.getRecommendedLayoutSettings();
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

  getCurrentAutoApplyRule(): AutoApplyRule | null {
    const file = this.getWritingMarkdownView()?.file;
    return file ? this.getWritingContextForFile(file).matchedRule : null;
  }

  beginLayoutChange(meta: Omit<LayoutChangeMeta, "targetKey">): void {
    if (this.isRestoringLayoutHistory) return;
    // 在记录历史目标键之前，先把当前笔记的独立版式准备好（若还没有）。
    // 否则对“全局默认 + 无规则”笔记的首次微调会在 begin 时按 global 记录，
    // 而 mutation 又创建了 document 版式，导致历史键不一致、无法撤回。
    const file = this.getWritingMarkdownView()?.file;
    if (file) this.ensureDocumentLayoutForCurrentFile(file);
    const targetKey = this.getLayoutHistoryTargetKey();
    this.pendingLayoutHistoryTargetKey = targetKey;
    this.layoutHistory.begin(
      { ...meta, targetKey },
      this.captureLayoutHistorySnapshot(targetKey),
    );
  }

  commitLayoutChange(
    meta: Omit<LayoutChangeMeta, "targetKey">,
  ): LayoutChangeRecord | null {
    const targetKey = this.pendingLayoutHistoryTargetKey;
    if (!targetKey || this.isRestoringLayoutHistory) return null;
    const record = this.layoutHistory.commit(
      { ...meta, targetKey },
      this.captureLayoutHistorySnapshot(targetKey),
    );
    this.pendingLayoutHistoryTargetKey = undefined;
    return record;
  }

  async cancelLayoutChange(): Promise<boolean> {
    const targetKey = this.pendingLayoutHistoryTargetKey;
    if (!targetKey) return false;
    const before = this.layoutHistory.cancel(targetKey);
    this.pendingLayoutHistoryTargetKey = undefined;
    if (!before) return false;
    try {
      await this.applyLayoutHistorySnapshot(before);
      this.refreshWritingPanels();
      return true;
    } catch {
      new Notice("无法取消这次版式修改，当前设置可能需要重新打开面板");
      return false;
    }
  }

  async performLayoutChange(
    meta: Omit<LayoutChangeMeta, "targetKey">,
    mutation: () => void | Promise<void>,
  ): Promise<LayoutChangeRecord | null> {
    this.beginLayoutChange(meta);
    try {
      await mutation();
      await this.saveAndApplySettings(false);
      const record = this.commitLayoutChange(meta);
      this.refreshWritingPanels();
      return record;
    } catch (error) {
      await this.cancelLayoutChange();
      throw error;
    }
  }

  async undoCurrentLayoutChange(): Promise<boolean> {
    const targetKey = this.getLayoutHistoryTargetKey();
    try {
      const record = await this.layoutHistory.undo(
        targetKey,
        (snapshot) => this.applyLayoutHistorySnapshot(snapshot),
      );
      if (!record) return false;
      this.refreshWritingPanels();
      new Notice("已撤回版式修改");
      return true;
    } catch {
      new Notice("版式撤回失败，当前设置未改变");
      return false;
    }
  }

  async redoCurrentLayoutChange(): Promise<boolean> {
    const targetKey = this.getLayoutHistoryTargetKey();
    try {
      const record = await this.layoutHistory.redo(
        targetKey,
        (snapshot) => this.applyLayoutHistorySnapshot(snapshot),
      );
      if (!record) return false;
      this.refreshWritingPanels();
      new Notice("已恢复版式修改");
      return true;
    } catch {
      new Notice("版式恢复失败，当前设置未改变");
      return false;
    }
  }

  canUndoCurrentLayoutChange(): boolean {
    return this.layoutHistory.canUndo(this.getLayoutHistoryTargetKey());
  }

  canRedoCurrentLayoutChange(): boolean {
    return this.layoutHistory.canRedo(this.getLayoutHistoryTargetKey());
  }

  async restoreLayoutHistoryEntry(id: string): Promise<boolean> {
    const found = this.layoutHistory.findRecord(id);
    if (!found) return false;
    try {
      await this.applyLayoutHistorySnapshot(found.record.after);
      this.refreshWritingPanels();
      return true;
    } catch {
      new Notice("无法恢复这条版式历史记录");
      return false;
    }
  }

  invalidateLayoutHistory(targetKey = "global"): void {
    this.layoutHistory.clear(targetKey);
    if (this.pendingLayoutHistoryTargetKey === targetKey) {
      this.pendingLayoutHistoryTargetKey = undefined;
    }
  }

  private getLayoutHistoryTargetKey(
    file = this.getWritingMarkdownView()?.file ?? null,
  ): string {
    if (!file) return "global";
    if (this.settings.documentLayouts[file.path]) return `document:${file.path}`;
    const context = this.getWritingContextForFile(file);
    return context.layoutSource.kind === "rule" && context.matchedRule
      ? `document:${file.path}`
      : "global";
  }

  private captureLayoutHistorySnapshot(
    targetKey = this.getLayoutHistoryTargetKey(),
  ): LayoutHistorySnapshot {
    if (targetKey.startsWith("document:")) {
      const path = targetKey.slice("document:".length);
      const documentLayout = this.settings.documentLayouts[path];
      const file = this.app.vault.getAbstractFileByPath(path);
      const effectiveValues = file instanceof TFile
        ? this.getLayoutSettingsForFile(file)
        : documentLayout?.values ?? this.getGlobalLayoutSettings();
      if (!documentLayout) {
        return cloneLayoutHistorySnapshot({
          target: { kind: "document", path },
          documentLayout: null,
          effectiveValues,
        });
      }
      const snapshot: LayoutHistorySnapshot = {
        target: { kind: "document", path },
        documentLayout: {
          ...documentLayout,
          values: { ...documentLayout.values },
          obsidianOverrides: { ...documentLayout.obsidianOverrides },
        },
        effectiveValues,
      };
      return cloneLayoutHistorySnapshot(snapshot);
    }

    return cloneLayoutHistorySnapshot({
      target: { kind: "global" },
      layoutPreset: this.settings.layoutPreset,
      values: this.getGlobalLayoutSettings(),
      obsidianOverrides: { ...this.settings.obsidianOverrides },
    });
  }

  private applyLayoutHistorySnapshotInMemory(
    snapshot: LayoutHistorySnapshot,
  ): void {
    if (isGlobalLayoutHistorySnapshot(snapshot)) {
      Object.assign(this.settings, snapshot.values);
      this.settings.layoutPreset = snapshot.layoutPreset;
      this.settings.obsidianOverrides = { ...snapshot.obsidianOverrides };
      return;
    }

    if (isDocumentLayoutHistorySnapshot(snapshot) && snapshot.documentLayout) {
      this.settings.documentLayouts[snapshot.target.path] = {
        ...snapshot.documentLayout,
        values: { ...snapshot.documentLayout.values },
        obsidianOverrides: { ...snapshot.documentLayout.obsidianOverrides },
      };
    } else {
      delete this.settings.documentLayouts[snapshot.target.path];
    }
  }

  private async applyLayoutHistorySnapshot(
    snapshot: LayoutHistorySnapshot,
  ): Promise<void> {
    const targetKey = snapshot.target.kind === "global"
      ? "global"
      : `document:${snapshot.target.path}`;
    const current = this.captureLayoutHistorySnapshot(targetKey);
    this.isRestoringLayoutHistory = true;
    try {
      this.applyLayoutHistorySnapshotInMemory(snapshot);
      await this.saveAndApplySettings(false);
    } catch (error) {
      try {
        this.applyLayoutHistorySnapshotInMemory(current);
        await this.saveAndApplySettings(false);
      } catch {
        // Keep the original failure as the actionable error for the caller.
      }
      throw error;
    } finally {
      this.isRestoringLayoutHistory = false;
    }
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
    this.invalidateLayoutHistory(`document:${file.path}`);
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
    new Notice(
      enabled
        ? "当前笔记已启用独立版式"
        : "当前笔记已恢复跟随自动规则或全局版式",
    );
  }

  previewLayoutSettings(patch: Partial<LayoutPresetValues>): void {
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCurrentFile(file) : undefined;
    if (documentLayout) {
      if (documentLayout.layoutPreset === "obsidian") {
        const overrides = documentLayout.obsidianOverrides ??= {};
        clearFollowObsidianFontOverrides(overrides, patch);
        Object.assign(
          overrides,
          normalizeLayoutPresetOverrides(patch),
        );
      } else {
        this.clearMeasuredContentWidthForPatch(documentLayout.values, patch);
        Object.assign(documentLayout.values, patch);
      }
    } else if (this.settings.layoutPreset === "obsidian") {
      clearFollowObsidianFontOverrides(this.settings.obsidianOverrides, patch);
      Object.assign(
        this.settings.obsidianOverrides,
        normalizeLayoutPresetOverrides(patch),
      );
    } else {
      this.clearMeasuredContentWidthForPatch(this.settings, patch);
      Object.assign(this.settings, patch);
    }
    this.syncAllViews();
  }

  previewGlobalLayoutSettings(patch: Partial<LayoutPresetValues>): void {
    if (!this.isRestoringLayoutHistory) this.invalidateLayoutHistory("global");
    if (this.settings.layoutPreset === "obsidian") {
      clearFollowObsidianFontOverrides(this.settings.obsidianOverrides, patch);
      Object.assign(
        this.settings.obsidianOverrides,
        normalizeLayoutPresetOverrides(patch),
      );
    } else {
      this.clearMeasuredContentWidthForPatch(this.settings, patch);
      Object.assign(this.settings, patch);
    }
    this.applySettings();
    this.syncAllViews();
  }

  private clearMeasuredContentWidthForPatch(
    target: { contentWidthPx?: number },
    patch: Partial<LayoutPresetValues>,
  ): void {
    if (
      patch.contentWidth !== undefined
      || patch.fontFamily !== undefined
      || patch.fontSize !== undefined
      || patch.letterSpacing !== undefined
    ) {
      delete target.contentWidthPx;
    }
  }

  markLayoutPresetEdited(): void {
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCurrentFile(file) : undefined;
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
    await this.enqueueSettingsSave();
    this.refreshWritingPanels();
  }

  async resetSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      formattingRules: { ...DEFAULT_FORMATTING_RULES },
      formattingRuleOrder: [...DEFAULT_SETTINGS.formattingRuleOrder],
      markdownFormatting: {
        ...DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
        repair: { ...DEFAULT_MARKDOWN_REPAIR_OPTIONS },
      },
      customFormattingPresets: [],
      layoutPreset: DEFAULT_SETTINGS.layoutPreset,
      userFonts: [],
      obsidianOverrides: {},
      customLayoutPresets: [],
      documentLayouts: {},
      cssClassLayoutRules: [],
      autoApplyRules: [],
      documentWritingModes: {},
    };
    this.layoutHistory.clear();
    this.pendingLayoutHistoryTargetKey = undefined;
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
    const rule = file ? this.getWritingContextForFile(file).matchedRule : null;
    const ruleValues = rule
      ? getLayoutPresetValues(rule.layoutPreset, this.settings.customLayoutPresets)
      : null;
    if (ruleValues) {
      return rule?.layoutPreset === "default"
        ? this.getRecommendedLayoutSettings()
        : ruleValues;
    }
    return this.settings.layoutPreset === "default"
      ? this.getRecommendedLayoutSettings()
      : normalizeLayoutPresetValues(captureLayoutPreset(this.settings));
  }

  /**
   * 推荐版式仍使用固定的中文字体候选顺序，但不把缺失的首选字体
   * 继续显示成“思源宋体/思源黑体”。运行时改用实际可用的候选，
   * 没有候选时回退到 Obsidian 当前暴露的字体名称。
   */
  private getRecommendedLayoutSettings(): LayoutPresetValues {
    const values = getLayoutPresetValues("default", []);
    if (!values) return normalizeLayoutPresetValues(captureLayoutPreset(DEFAULT_SETTINGS));

    const obsidianFamily = readObsidianTypographyBaseline().fontFamily;
    const bodyName = resolveRecommendedFontName(values.fontFamily, obsidianFamily);
    const headingName = resolveRecommendedFontName(values.headingFontFamily, obsidianFamily);
    const bodyFont: FontSelection = bodyName
      ? { source: "system", id: bodyName }
      : { source: "obsidian", id: "text" };
    const headingFont: FontSelection = headingName
      ? { source: "system", id: headingName }
      : { source: "obsidian", id: "heading" };
    const bodyFamily = fontSelectionToLegacyFontFamily(bodyFont, "body");
    const headingFamily = fontSelectionToLegacyFontFamily(headingFont, "heading");

    return normalizeLayoutPresetValues({
      ...values,
      bodyFont,
      headingFont,
      fontFamily: bodyFamily,
      headingFontFamily: headingFamily,
      quoteFontFamily: bodyFamily,
      boldFontFamily: bodyFamily,
      italicFontFamily: bodyFamily,
    });
  }

  /**
   * 读取 Obsidian 当前排版，供控制面板与导出预览显示参考。
   * 跟随模式的实际页面样式绝不使用这个快照，而是保留原生选择器。
   */
  private captureObsidianLayoutValues(): LayoutPresetValues {
    const baseline = readObsidianTypographyBaseline();
    const fontFamily = baseline.fontFamily || OBSIDIAN_NATIVE_FONT_FAMILY;
    const renderedWidth = this.captureObsidianRenderedContentWidth();
    const values = normalizeLayoutPresetValues({
      bodyFont: { source: "obsidian", id: "text" },
      headingFont: { source: "obsidian", id: "heading" },
      quoteFont: { source: "inherit", id: "body" },
      boldFont: { source: "inherit", id: "body" },
      italicFont: { source: "inherit", id: "body" },
      fontFamily,
      headingFontFamily: fontFamily,
      quoteFontFamily: fontFamily,
      boldFontFamily: fontFamily,
      italicFontFamily: fontFamily,
      fontSize: baseline.fontSize,
      lineHeight: baseline.lineHeight,
      letterSpacing: baseline.letterSpacing,
      paragraphSpacing: 0,
      firstLineIndent: 0,
      contentWidth: renderedWidth?.characterHint ?? 0,
      leftMargin: 0,
      rightMargin: 0,
      contentWidthPx: renderedWidth?.pixels,
      paperTheme: "plain",
      customPaperImage: "",
      justifyText: false,
    });
    // 字符数只用于面板提示；保存为固定模板时使用实测像素宽度，避免重新换算造成偏移。
    values.contentWidth = renderedWidth?.characterHint ?? 0;
    return values;
  }

  private captureObsidianRenderedContentWidth(
    view = this.getWritingMarkdownView(),
  ): RenderedContentWidth | null {
    if (!view) return null;
    const selector = view.getMode() === "preview"
      ? ".markdown-preview-view .markdown-preview-sizer"
      : ".markdown-source-view.mod-cm6 .cm-sizer";
    const content = view.containerEl.querySelector<HTMLElement>(selector);
    if (!content) return null;

    const fontSize = Number.parseFloat(getComputedStyle(content).fontSize);
    return describeRenderedContentWidth(
      content.getBoundingClientRect().width,
      fontSize,
    );
  }

  private getLayoutPresetIdForFile(file: TFile | null): LayoutPresetId {
    if (!file) return this.settings.layoutPreset;
    return this.getWritingContextForFile(file).layoutPreset;
  }

  private getFollowObsidianOverridesForFile(file: TFile | null): LayoutPresetOverrides {
    const documentLayout = file ? this.settings.documentLayouts[file.path] : undefined;
    if (documentLayout?.layoutPreset === "obsidian") {
      return documentLayout.obsidianOverrides ?? {};
    }
    return this.settings.obsidianOverrides;
  }

  private ensureDocumentLayoutForCurrentFile(file: TFile): DocumentLayoutSettings {
    const existing = this.settings.documentLayouts[file.path];
    if (existing) return existing;
    // 命中自动规则时沿用规则模板的 layoutPreset（保持规则优先级）；
    // 未命中规则（全局默认 / 手动）时基于当前显示版式快照创建独立版式，
    // 这样右侧面板的版式微调只改当前笔记，不再泄漏到全局设置。
    const context = this.getWritingContextForFile(file);
    const rule = context.layoutSource.kind === "rule" ? context.matchedRule : null;
    const documentLayout: DocumentLayoutSettings = {
      layoutPreset: rule?.layoutPreset ?? context.layoutPreset,
      values: this.getLayoutSettingsForFile(file),
      obsidianOverrides: {},
    };
    this.settings.documentLayouts[file.path] = documentLayout;
    return documentLayout;
  }

  /**
   * 把主题的标题档位解析成 px 写到容器上（--cw-hN-size 等）。
   * Obsidian 的 --hN-size 是 em，会随插件改动的正文基础字号放大；
   * 解析成 px 后由 CSS 固定标题档位，正文字号不再影响标题。
   * 解析不了的档位不写变量，CSS 回退到 var(--hN-size)。
   */
  private applyHeadingSizeVariables(target: HTMLElement): void {
    const sizes = readObsidianHeadingSizes();
    const apply = (key: HeadingSizeKey, variable: string): void => {
      const px = sizes[key];
      if (px === undefined) target.style.removeProperty(variable);
      else target.style.setProperty(variable, `${px}px`);
    };
    apply("h1", "--cw-h1-size");
    apply("h2", "--cw-h2-size");
    apply("h3", "--cw-h3-size");
    apply("h4", "--cw-h4-size");
    apply("h5", "--cw-h5-size");
    apply("h6", "--cw-h6-size");
    apply("inline-title", "--cw-inline-title-size");
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
      if (overrides.fontSize !== undefined) {
        target.style.setProperty("--cw-font-size", `${layout.fontSize}px`);
        // 跟随模式下改了正文字号同样会把标题档位钉住，否则标题会一起放大。
        this.applyHeadingSizeVariables(target);
      }
      if (overrides.lineHeight !== undefined) target.style.setProperty("--cw-line-height", `${layout.lineHeight}`);
      if (overrides.letterSpacing !== undefined) target.style.setProperty("--cw-letter-spacing", `${layout.letterSpacing}px`);
      if (overrides.paragraphSpacing !== undefined) target.style.setProperty("--cw-paragraph-spacing", `${layout.paragraphSpacing}em`);
      if (overrides.firstLineIndent !== undefined) target.style.setProperty("--cw-first-line-indent", `${layout.firstLineIndent}em`);
      if (overrides.contentWidth !== undefined) target.style.setProperty("--cw-content-width", `${layout.contentWidth}em`);
      if (overrides.leftMargin !== undefined) target.style.setProperty("--cw-left-margin", `${layout.leftMargin}em`);
      if (overrides.rightMargin !== undefined) target.style.setProperty("--cw-right-margin", `${layout.rightMargin}em`);
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
    this.applyHeadingSizeVariables(target);
    target.style.setProperty("--cw-line-height", `${layout.lineHeight}`);
    target.style.setProperty("--cw-letter-spacing", `${layout.letterSpacing}px`);
    target.style.setProperty("--cw-paragraph-spacing", `${layout.paragraphSpacing}em`);
    target.style.setProperty("--cw-first-line-indent", `${layout.firstLineIndent}em`);
    target.style.setProperty(
      "--cw-content-width",
      layout.contentWidthPx === undefined ? `${layout.contentWidth}em` : `${layout.contentWidthPx}px`,
    );
    target.style.setProperty("--cw-left-margin", `${layout.leftMargin}em`);
    target.style.setProperty("--cw-right-margin", `${layout.rightMargin}em`);
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
      "cw-highlight-current-line",
      this.settings.highlightCurrentLine,
    );
    this.applyTypewriterRuntime(typewriterPosition);
  }

  private getTypewriterRuntimeState(): TypewriterRuntimeState {
    const file = this.getWritingMarkdownView()?.file ?? null;
    return {
      manualEnabled: this.settings.typewriterMode,
      autoEnabled: this.settings.autoTypewriterOnWritingMode,
      writingModeEnabled: this.isNovelFile(file),
      autoSuppressed: Boolean(file && this.autoTypewriterSuppressedPath === file.path),
    };
  }

  isTypewriterModeEnabled(): boolean {
    return getEffectiveTypewriterMode(this.getTypewriterRuntimeState());
  }

  private applyTypewriterRuntime(
    typewriterPosition = normalizeTypewriterCursorPosition(
      this.settings.typewriterCursorPosition,
    ),
  ): void {
    const effectiveTypewriterMode = this.isTypewriterModeEnabled();
    document.body.classList.toggle("cw-typewriter-mode", effectiveTypewriterMode);
    const repositionTypewriter = shouldRepositionTypewriter(
      this.appliedTypewriterPosition,
      this.appliedTypewriterMode,
      typewriterPosition,
      effectiveTypewriterMode,
    );
    this.appliedTypewriterPosition = typewriterPosition;
    this.appliedTypewriterMode = effectiveTypewriterMode;
    if (repositionTypewriter) {
      document.dispatchEvent(new CustomEvent("cw-typewriter-position-change"));
    }
  }

  private updateAutoTypewriterEntryState(): void {
    const file = this.getWritingMarkdownView()?.file ?? null;
    const writingPath = file && this.isNovelFile(file) ? file.path : undefined;
    if (writingPath && writingPath !== this.lastAutoTypewriterWritingPath) {
      if (this.autoTypewriterSuppressedPath === writingPath) {
        this.autoTypewriterSuppressedPath = undefined;
      }
    }
    this.lastAutoTypewriterWritingPath = writingPath;
    if (!this.settings.autoTypewriterOnWritingMode) {
      this.autoTypewriterSuppressedPath = undefined;
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

  private getWritingFileFacts(file: TFile): WritingFileFacts {
    const cache = this.app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      basename: file.basename,
      tags: cache ? getAllTags(cache) ?? [] : [],
      cssClasses: this.getCssClassesForFile(file),
    };
  }

  getWritingContextForFile(file: TFile): ResolvedWritingContext {
    return resolveWritingContext(this.getWritingFileFacts(file), this.settings);
  }

  getCurrentDocumentWritingMode(): DocumentWritingMode | null {
    const file = this.getWritingMarkdownView()?.file;
    return file ? this.settings.documentWritingModes[file.path] ?? null : null;
  }

  isNovelFile(file: TFile | null): boolean {
    return file ? this.getWritingContextForFile(file).enabled : false;
  }

  async toggleNovelMode(file: TFile, notify = true): Promise<void> {
    const wasEnabled = this.isNovelFile(file);
    this.settings.documentWritingModes[file.path] = wasEnabled ? "force-off" : "force-on";
    this.autoTypewriterSuppressedPath = undefined;
    await this.saveAndApplySettings();
    if (notify) new Notice(wasEnabled ? "已关闭写作模式" : "已开启写作模式");
  }

  async clearCurrentDocumentWritingMode(notify = true): Promise<void> {
    const file = this.getWritingMarkdownView()?.file;
    if (!file) {
      if (notify) new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    if (!this.settings.documentWritingModes[file.path]) {
      if (notify) new Notice("当前笔记已在跟随自动规则");
      return;
    }
    delete this.settings.documentWritingModes[file.path];
    this.autoTypewriterSuppressedPath = undefined;
    await this.saveAndApplySettings();
    if (notify) new Notice("当前笔记已恢复跟随自动规则");
  }

  private hasStoredDocumentPath(path: string): boolean {
    const prefix = `${path}/`;
    return [
      ...Object.keys(this.settings.documentLayouts),
      ...Object.keys(this.settings.documentWritingModes),
    ].some((storedPath) => storedPath === path || storedPath.startsWith(prefix));
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
      container.classList.toggle(
        "cw-custom-horizontal-margins",
        enabled && (followObsidian
          ? overrides.leftMargin !== undefined || overrides.rightMargin !== undefined
          : layout.leftMargin > 0 || layout.rightMargin > 0),
      );
      for (const className of FOLLOW_OBSIDIAN_OVERRIDE_CLASSES) {
        container.classList.remove(className);
      }
      for (const className of HEADING_CENTER_CLASSES) {
        container.classList.remove(className);
      }
      if (enabled && this.settings.centerHeadings) {
        for (const level of HEADING_LEVELS) {
          if (this.settings.centerHeadingLevels.includes(level)) {
            container.classList.add(`cw-heading-center-h${level}`);
          }
        }
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
      syncReadingProseLines(container, enabled);
    }
    this.updateAutoTypewriterEntryState();
    this.applyTypewriterRuntime();
  }

  private clearViewClasses(leaf: WorkspaceLeaf): void {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    syncReadingProseLines(view.containerEl, false);
    view.containerEl.classList.remove(
      "cw-novel-enabled",
      "cw-ragged-text",
      "cw-follow-obsidian",
      "cw-focus-native-width",
      "cw-custom-horizontal-margins",
      ...FOLLOW_OBSIDIAN_OVERRIDE_CLASSES,
      ...HEADING_CENTER_CLASSES,
      ...PAPER_CLASSES,
    );
    for (const property of LAYOUT_CSS_VARIABLES) view.containerEl.style.removeProperty(property);
    view.containerEl.style.removeProperty(FOCUS_CONTENT_WIDTH_VARIABLE);
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

  private scheduleStartupMarkdownSync(attempt = 0): void {
    const delays = [0, 100, 300, 800] as const;
    const delay = delays[Math.min(attempt, delays.length - 1)];
    this.startupMarkdownSyncTimer = window.setTimeout(() => {
      this.startupMarkdownSyncTimer = undefined;
      const view = this.getWritingMarkdownView();
      if (view?.file) {
        this.lastMarkdownLeaf = view.leaf;
        this.syncAllViews();
        this.updateStatusBar();
        this.refreshWritingPanels();
        return;
      }
      if (attempt < delays.length - 1) {
        this.scheduleStartupMarkdownSync(attempt + 1);
      }
    }, delay);
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;
    // 使用写作视图回退链：当右侧写作工坊（非 Markdown 视图）处于激活状态时，
    // getActiveViewOfType(MarkdownView) 会取不到正文，导致状态栏统计失效。
    // 状态栏始终对应最近使用的正文 Markdown 笔记。
    const view = this.getWritingMarkdownView();
    const enabled = this.isNovelFile(view?.file ?? null);
    this.statusBarItem.toggleClass(
      "cw-status-hidden",
      !this.settings.showStatusBar || !enabled,
    );
    if (!view || !enabled) return;

    const text = view.editor.getValue();
    const wordCount = countWritingText(text, this.settings.countMode);
    const issueCount = this.settings.showDiagnostics
      ? analyzeChineseText(text).length
      : 0;
    this.statusBarItem.setText(
      `正文 ${wordCount.toLocaleString()} 字${
        this.settings.showDiagnostics ? ` · 提示 ${issueCount}` : ""
      }`,
    );
    this.statusBarItem.setAttribute(
      "title",
      this.settings.countMode === "creative"
        ? "创作字数：汉字逐字计数，连续英文和数字各算一词，并忽略 Markdown 标记与隐藏内容。"
        : "正文字符数：移除 YAML 和空白后，其余字符均计入。",
    );
  }

  private async cyclePaperTheme(): Promise<void> {
    const themes = PAPER_THEME_OPTIONS.map((option) => option.value);
    const layout = this.getCurrentLayoutSettings();
    const current = themes.indexOf(layout.paperTheme);
    const paperTheme = themes[(current + 1) % themes.length];
    await this.performLayoutChange(
      {
        mergeKey: "field:paperTheme",
        summary: { kind: "field", key: "paperTheme" },
      },
      () => {
        this.markLayoutPresetEdited();
        this.previewLayoutSettings({ paperTheme });
      },
    );
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
    const remembered = this.lastMarkdownLeaf?.view;
    const loaded = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView);
    const view = selectMarkdownView(
      active,
      remembered instanceof MarkdownView ? remembered : null,
      loaded,
    );
    if (view) this.lastMarkdownLeaf = view.leaf;
    return view;
  }

  openNativeFindReplace(): void {
    const view = this.getWritingMarkdownView();
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }

    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    view.editor.focus();
    const commands = (this.app as unknown as {
      commands?: { executeCommandById(id: string): boolean };
    }).commands;
    if (!commands?.executeCommandById("editor:open-search-replace")) {
      new Notice("当前版本的 Obsidian 无法打开查找替换");
    }
  }

  openFileRecoverySnapshots(): void {
    const view = this.getWritingMarkdownView();
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }

    const commands = (this.app as unknown as {
      commands?: { executeCommandById: (id: string) => boolean };
    }).commands;
    try {
      this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
      if (commands?.executeCommandById("file-recovery:open")) return;
    } catch {
      // The command is unavailable when the File recovery core plugin is disabled.
    }
    new Notice("请先在“设置 → 核心插件”中启用“文件恢复”。");
  }

  async openWritingPanel(setProfessionalMode = true): Promise<void> {
    const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (currentView) this.lastMarkdownLeaf = currentView.leaf;

    if (setProfessionalMode && this.settings.interfaceMode !== "professional") {
      this.settings.interfaceMode = "professional";
      await this.enqueueSettingsSave();
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
    await this.enqueueSettingsSave();
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
    const file = this.getWritingMarkdownView()?.file ?? null;
    const plan = planTypewriterToggle(this.getTypewriterRuntimeState());
    this.settings.typewriterMode = plan.manualEnabled;
    this.autoTypewriterSuppressedPath = plan.autoSuppressed && file
      ? file.path
      : undefined;
    if (this.autoTypewriterSuppressedPath) {
      this.lastAutoTypewriterWritingPath = this.autoTypewriterSuppressedPath;
    }
    await this.saveAndApplySettings();

    const view = this.getWritingMarkdownView();
    const enabled = this.isTypewriterModeEnabled();
    if (view && enabled) {
      const cursor = view.editor.getCursor();
      view.editor.scrollIntoView({ from: cursor, to: cursor }, true);
    }
    new Notice(enabled ? "已开启打字机模式" : "已关闭打字机模式");
  }

  async setManualTypewriterMode(enabled: boolean): Promise<void> {
    const file = this.getWritingMarkdownView()?.file ?? null;
    this.settings.typewriterMode = enabled;
    this.autoTypewriterSuppressedPath = !enabled
      && file
      && this.settings.autoTypewriterOnWritingMode
      && this.isNovelFile(file)
      ? file.path
      : undefined;
    if (this.autoTypewriterSuppressedPath) {
      this.lastAutoTypewriterWritingPath = this.autoTypewriterSuppressedPath;
    }
    await this.saveAndApplySettings();
  }

  isFocusModeEnabled(): boolean {
    return this.focusModeEnabled;
  }

  toggleFocusMode(enabled = !this.focusModeEnabled, notify = true): void {
    if (enabled) {
      this.clearFocusContentWidth();
      this.captureFocusContentWidth();
    }
    this.focusModeEnabled = enabled;
    document.body.classList.toggle("cw-focus-mode", enabled);
    if (!enabled) this.clearFocusContentWidth();
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

  private captureFocusContentWidth(): void {
    const view = this.getWritingMarkdownView();
    if (!view?.file || !this.isNovelFile(view.file)) return;
    if (this.getLayoutPresetIdForFile(view.file) !== "obsidian") return;
    const overrides = this.getFollowObsidianOverridesForFile(view.file);
    if (overrides.contentWidth !== undefined) return;

    const renderedWidth = this.captureObsidianRenderedContentWidth(view);
    if (!renderedWidth) return;
    view.containerEl.style.setProperty(
      FOCUS_CONTENT_WIDTH_VARIABLE,
      `${renderedWidth.pixels}px`,
    );
    view.containerEl.classList.add("cw-focus-native-width");
  }

  private clearFocusContentWidth(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      view.containerEl.classList.remove("cw-focus-native-width");
      view.containerEl.style.removeProperty(FOCUS_CONTENT_WIDTH_VARIABLE);
    }
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
      imageExportWidth: this.settings.imageExportWidth,
    });
  }

  async prepareExportContent(
    options: ExportContentOptions,
    view = this.getWritingMarkdownView(),
  ): Promise<PreparedExportContent | null> {
    if (!view?.file) return null;
    const sources = await this.getExportSources(options.scope, view);
    return prepareExportContentFromSources(sources, options);
  }

  async prepareLongImagePlan(
    options: ExportContentOptions,
    width = this.settings.imageExportWidth,
    view = this.getWritingMarkdownView(),
  ): Promise<{ prepared: PreparedExportContent; plan: LongImagePlan } | null> {
    const prepared = await this.prepareExportContent(options, view);
    if (!view?.file || !prepared?.text || !prepared.blocks) return null;
    const layout = this.getLayoutSettingsForFile(view.file);
    const layoutViewportWidthPx = this.getMobileImageLayoutViewportWidth(view);
    const plan = await createLongImagePlan(prepared.blocks, {
      width: normalizeImageExportWidth(width),
      layoutViewportWidthPx,
      fontFamily: layout.fontFamily,
      headingFontFamily: layout.headingFontFamily,
      fontSizePx: layout.fontSize,
      lineHeight: layout.lineHeight,
      paragraphSpacingEm: layout.paragraphSpacing,
      firstLineIndentEm: layout.firstLineIndent,
      paperTheme: layout.paperTheme,
      centerHeadings: this.settings.centerHeadings,
      centerHeadingLevels: this.settings.centerHeadingLevels,
      deviceBudget: getImageExportDeviceBudget(Platform.isMobileApp),
    });
    return { prepared, plan };
  }

  async copyPreparedExportContent(
    content: Pick<PreparedExportContent, "text" | "contentMode">,
  ): Promise<boolean> {
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(content.text);
      new Notice(content.contentMode === "markdown"
        ? "已复制 Markdown 全文"
        : "已复制纯文本全文");
      return true;
    } catch (error) {
      console.error("中文写作排版：复制导出内容失败", error);
      new Notice("复制失败，请重试");
      return false;
    }
  }

  async exportNotes(request: ExportRequest): Promise<boolean> {
    const view = this.getWritingMarkdownView();
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return false;
    }

    let writtenImagePaths: string[] = [];
    try {
      const prepared = request.preparedContent ?? await this.prepareExportContent(request, view);
      if (!prepared?.text) {
        new Notice("所选范围没有可导出的正文");
        return false;
      }
      const layout = this.getLayoutSettingsForFile(view.file);
      const documentTitle = request.scope === "folder"
        ? `${view.file.parent?.name || this.app.vault.getName()}整稿`
        : view.file.basename;
      const mobileVaultExport = Platform.isMobileApp;
      if (mobileVaultExport) await this.ensureMobileExportFolder();
      const selectedPath = mobileVaultExport
        ? null
        : await this.chooseLocalExportPath(documentTitle, request.format);
      if (!mobileVaultExport && !selectedPath) return false;
      const pathExists = mobileVaultExport
        ? (path: string): boolean => (
          this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null
        )
        : (path: string): boolean => this.localExportPathExists(path);
      const getExportPath = (extension: ExportFormat): string => mobileVaultExport
        ? getAvailableExportPath(documentTitle, pathExists, extension)
        : getAvailableLocalExportPath(selectedPath!, extension, pathExists);
      let noticePath = "";
      if (request.format === "docx") {
        if (!prepared.blocks) throw new Error("DOCX export blocks unavailable");
        const exportPath = getExportPath("docx");
        const data = createDocx(prepared.blocks, {
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
        await this.writeExportBinary(exportPath, data, mobileVaultExport);
        noticePath = exportPath;
      } else if (request.format === "png") {
        if (!prepared.blocks) throw new Error("PNG export blocks unavailable");
        const layoutViewportWidthPx = this.getMobileImageLayoutViewportWidth(view);
        const imageOptions = {
          width: normalizeImageExportWidth(request.imageExportWidth ?? this.settings.imageExportWidth),
          layoutViewportWidthPx,
          fontFamily: layout.fontFamily,
          headingFontFamily: layout.headingFontFamily,
          fontSizePx: layout.fontSize,
          lineHeight: layout.lineHeight,
          paragraphSpacingEm: layout.paragraphSpacing,
          firstLineIndentEm: layout.firstLineIndent,
          paperTheme: layout.paperTheme,
          centerHeadings: this.settings.centerHeadings,
          centerHeadingLevels: this.settings.centerHeadingLevels,
          deviceBudget: getImageExportDeviceBudget(Platform.isMobileApp),
        } as const;
        const plan = request.longImagePlan ?? await createLongImagePlan(prepared.blocks, imageOptions);
        const imageTarget = mobileVaultExport
          ? {
            directory: EXPORT_FOLDER,
            baseName: getAvailableExportBaseName(documentTitle, pathExists, "png"),
          }
          : getAvailableLocalImageExportTarget(selectedPath!, pathExists);
        if (!mobileVaultExport && imageTarget.directory) {
          this.lastLocalExportDirectory = imageTarget.directory;
        }
        writtenImagePaths = [];
        for (const [index, segment] of plan.segments.entries()) {
          request.onProgress?.(index + 1, plan.segments.length);
          const image = await renderLongImageSegment(segment, imageOptions);
          const filename = plan.segments.length === 1
            ? `${imageTarget.baseName}.png`
            : `${imageTarget.baseName}-第${index + 1}张.png`;
          const exportPath = mobileVaultExport
            ? normalizePath(`${EXPORT_FOLDER}/${filename}`)
            : joinLocalExportPath(imageTarget.directory, filename);
          await this.writeExportBinary(exportPath, image, mobileVaultExport);
          writtenImagePaths.push(exportPath);
          await yieldLongImageExport();
        }
        noticePath = plan.segments.length === 1
          ? writtenImagePaths[0]
          : `${writtenImagePaths[0]} 等 ${plan.segments.length} 张`;
      } else if (request.format === "md") {
        const exportPath = getExportPath("md");
        await this.writeExportText(exportPath, prepared.text, mobileVaultExport);
        noticePath = exportPath;
      } else {
        const exportPath = getExportPath("txt");
        await this.writeExportText(exportPath, `${prepared.text}\n`, mobileVaultExport);
        noticePath = exportPath;
      }

      this.settings.preferredExportFormat = request.format;
      this.settings.preferredExportScope = request.scope;
      this.settings.includeFileTitles = request.includeFileTitles;
      if (request.format !== "md") {
        this.settings.stripMarkdownOnExport = request.stripMarkdown;
      }
      if (request.format === "png") {
        this.settings.imageExportWidth = normalizeImageExportWidth(
          request.imageExportWidth ?? this.settings.imageExportWidth,
        );
      }
      this.settings.openFolderAfterExport = mobileVaultExport
        ? false
        : request.openFolderAfterExport;
      this.settings.wordTitlePage = request.wordTitlePage;
      this.settings.wordPageNumbers = request.wordPageNumbers;
      this.settings.wordHeader = request.wordHeader;
      await this.commitSettings();
      new Notice(mobileVaultExport
        ? `已导出：${noticePath}`
        : `已导出到本地：${noticePath}`);
      if (!mobileVaultExport && request.openFolderAfterExport) await this.openExportFolder();
      return true;
    } catch (error) {
      console.error("中文写作排版：导出失败", error);
      if (request.format === "png") {
        const generated = writtenImagePaths.length > 0
          ? `已生成 ${writtenImagePaths.length} 张：${writtenImagePaths.join("、")}`
          : "尚未生成图片";
        new Notice(`长图导出未完成（${generated}）。请改用较低分辨率后重试`);
        return false;
      }
      new Notice(Platform.isMobileApp
        ? "导出失败，请确认“写作导出/”路径可用"
        : "导出失败，请确认选择的本地路径可用");
      return false;
    }
  }

  private getMobileImageLayoutViewportWidth(_view: MarkdownView): number | undefined {
    if (!Platform.isMobileApp) return undefined;
    return MOBILE_IMAGE_LAYOUT_VIEWPORT_WIDTH;
  }

  private async ensureMobileExportFolder(): Promise<void> {
    const exportFolder = normalizePath(EXPORT_FOLDER);
    if (!this.app.vault.getAbstractFileByPath(exportFolder)) {
      await this.app.vault.createFolder(exportFolder);
    }
  }

  private getDefaultLocalExportPath(documentTitle: string, extension: string): string {
    const fileName = `${sanitizeExportName(documentTitle)}.${extension}`;
    return this.lastLocalExportDirectory
      ? joinLocalExportPath(this.lastLocalExportDirectory, fileName)
      : fileName;
  }

  private async chooseLocalExportPath(
    documentTitle: string,
    extension: ExportFormat,
  ): Promise<string | null> {
    if (!Platform.isDesktopApp) {
      new Notice("当前设备暂不支持直接保存到本地，请在桌面端导出");
      return null;
    }

    try {
      const electron = require("electron") as {
        dialog?: {
          showSaveDialog: (options: {
            defaultPath: string;
            title: string;
            filters: Array<{ name: string; extensions: string[] }>;
          }) => Promise<{ canceled: boolean; filePath?: string }>;
        };
        remote?: {
          dialog?: {
            showSaveDialog: (options: {
              defaultPath: string;
              title: string;
              filters: Array<{ name: string; extensions: string[] }>;
            }) => Promise<{ canceled: boolean; filePath?: string }>;
          };
        };
      };
      const dialog = electron.dialog ?? electron.remote?.dialog;
      if (!dialog) throw new Error("Electron save dialog unavailable");
      const result = await dialog.showSaveDialog({
        defaultPath: this.getDefaultLocalExportPath(documentTitle, extension),
        title: "选择本地导出位置",
        filters: [{
          name: `${extension.toUpperCase()} 文件`,
          extensions: [extension],
        }],
      });
      if (result.canceled || !result.filePath) {
        new Notice("已取消导出");
        return null;
      }
      this.lastLocalExportDirectory = getLocalExportDirectory(result.filePath);
      return result.filePath;
    } catch (error) {
      console.error("中文写作排版：打开本地保存对话框失败", error);
      new Notice("无法打开本地保存对话框，请重试");
      return null;
    }
  }

  private localExportPathExists(path: string): boolean {
    const fs = require("fs") as {
      existsSync: (targetPath: string) => boolean;
    };
    return fs.existsSync(path);
  }

  private async writeLocalText(filePath: string, content: string): Promise<void> {
    const fs = require("fs/promises") as {
      writeFile: (targetPath: string, data: string, encoding: "utf8") => Promise<void>;
    };
    await fs.writeFile(filePath, content, "utf8");
  }

  private async writeLocalBinary(filePath: string, data: ArrayBuffer): Promise<void> {
    const fs = require("fs/promises") as {
      writeFile: (targetPath: string, data: Uint8Array) => Promise<void>;
    };
    await fs.writeFile(filePath, new Uint8Array(data));
  }

  private async writeExportText(
    filePath: string,
    content: string,
    toVault: boolean,
  ): Promise<void> {
    if (toVault) {
      await this.app.vault.create(normalizePath(filePath), content);
      return;
    }
    await this.writeLocalText(filePath, content);
  }

  private async writeExportBinary(
    filePath: string,
    data: ArrayBuffer,
    toVault: boolean,
  ): Promise<void> {
    if (toVault) {
      await this.app.vault.createBinary(normalizePath(filePath), data);
      return;
    }
    await this.writeLocalBinary(filePath, data);
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
    if (!this.lastLocalExportDirectory) {
      new Notice("还没有本地导出记录，请先导出一份文件");
      return;
    }
    await this.openLocalFolder(this.lastLocalExportDirectory);
  }

  async openCurrentNoteFolder(): Promise<void> {
    const file = this.getWritingMarkdownView()?.file;
    if (!file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    const adapter = this.app.vault.adapter;
    if (Platform.isDesktopApp && adapter instanceof FileSystemAdapter) {
      try {
        const electron = require("electron") as {
          shell: { showItemInFolder: (path: string) => void };
        };
        electron.shell.showItemInFolder(adapter.getFullPath(file.path));
        return;
      } catch {
        // Fall back to opening the folder or revealing it in Obsidian.
      }
    }
    const folderPath = getVaultFolderPath(file.path);
    await this.openVaultFolder(
      folderPath,
      "已在 Obsidian 文件列表中定位到当前文件所在文件夹",
      folderPath
        ? `当前文件所在文件夹：${folderPath}/`
        : "当前文件位于仓库根目录",
    );
  }

  private async openVaultFolder(
    folderPath: string,
    mobileNotice: string,
    fallbackNotice: string,
  ): Promise<void> {
    const normalizedFolderPath = normalizePath(folderPath);
    const adapter = this.app.vault.adapter;

    if (Platform.isDesktopApp && adapter instanceof FileSystemAdapter) {
      try {
        const electron = require("electron") as {
          shell: { openPath: (path: string) => Promise<string> };
        };
        const absolutePath = adapter.getFullPath(normalizedFolderPath);
        const error = await electron.shell.openPath(absolutePath);
        if (!error) return;
      } catch {
        // Fall through to Obsidian's file explorer when Electron is unavailable.
      }
    }

    const folder = normalizedFolderPath
      ? this.app.vault.getAbstractFileByPath(normalizedFolderPath)
      : this.app.vault.getRoot();
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (leaf && folder) {
      await this.app.workspace.revealLeaf(leaf);
      const explorer = leaf.view as unknown as {
        revealInFolder?: (target: typeof folder) => Promise<void> | void;
      };
      await explorer.revealInFolder?.(folder);
      new Notice(mobileNotice);
      return;
    }
    new Notice(fallbackNotice);
  }

  private async openLocalFolder(folderPath: string): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("当前设备暂不支持打开本地导出文件夹");
      return;
    }

    try {
      const electron = require("electron") as {
        shell?: { openPath: (path: string) => Promise<string> };
      };
      if (!electron.shell) throw new Error("Electron shell unavailable");
      const error = await electron.shell.openPath(folderPath);
      if (!error) return;
    } catch (error) {
      console.error("中文写作排版：打开本地导出文件夹失败", error);
    }
    new Notice(`无法打开本地导出文件夹：${folderPath}`);
  }

  async applyLayoutPreset(presetId: LayoutPresetId): Promise<void> {
    if (presetId === "obsidian") {
      await this.performLayoutChange(
        {
          summary: {
            kind: "template",
            presetName: this.getLayoutPresetLabel(presetId),
          },
        },
        () => this.applyLayoutPresetInMemory(presetId),
      );
      new Notice("已应用跟随 Obsidian：正文保持 Obsidian 当前排版");
      return;
    }
    const values = presetId === "default"
      ? this.getRecommendedLayoutSettings()
      : getLayoutPresetValues(presetId, this.settings.customLayoutPresets);
    if (!values) {
      const file = this.getWritingMarkdownView()?.file;
      const documentLayout = file ? this.settings.documentLayouts[file.path] : undefined;
      if (documentLayout) documentLayout.layoutPreset = "custom";
      else this.settings.layoutPreset = "custom";
      await this.commitSettings();
      return;
    }
    await this.performLayoutChange(
      {
        summary: {
          kind: "template",
          presetName: this.getLayoutPresetLabel(presetId),
        },
      },
      () => this.applyLayoutPresetInMemory(presetId),
    );
    new Notice(presetId === "default" ? "已应用推荐写作版式" : "已应用自定义版式模板");
  }

  private applyLayoutPresetInMemory(presetId: LayoutPresetId): void {
    if (presetId === "obsidian") {
      const file = this.getWritingMarkdownView()?.file;
      const documentLayout = file ? this.ensureDocumentLayoutForCurrentFile(file) : undefined;
      if (documentLayout) {
        documentLayout.layoutPreset = "obsidian";
        documentLayout.obsidianOverrides = {};
      } else {
        this.settings.layoutPreset = "obsidian";
        this.settings.obsidianOverrides = {};
      }
      return;
    }
    const values = presetId === "default"
      ? this.getRecommendedLayoutSettings()
      : getLayoutPresetValues(presetId, this.settings.customLayoutPresets);
    if (!values) return;
    const normalized = normalizeLayoutPresetValues(values);
    const file = this.getWritingMarkdownView()?.file;
    const documentLayout = file ? this.ensureDocumentLayoutForCurrentFile(file) : undefined;
    if (documentLayout) {
      documentLayout.values = normalized;
      documentLayout.layoutPreset = presetId;
    } else {
      Object.assign(this.settings, normalized);
      if (normalized.contentWidthPx === undefined) delete this.settings.contentWidthPx;
      this.settings.layoutPreset = presetId;
    }
  }

  async applyGlobalLayoutPreset(presetId: LayoutPresetId): Promise<void> {
    this.invalidateLayoutHistory("global");
    if (presetId === "obsidian") {
      this.settings.layoutPreset = "obsidian";
      this.settings.obsidianOverrides = {};
      await this.saveAndApplySettings();
      return;
    }
    const values = presetId === "default"
      ? this.getRecommendedLayoutSettings()
      : getLayoutPresetValues(presetId, this.settings.customLayoutPresets);
    if (values) {
      const normalized = normalizeLayoutPresetValues(values);
      Object.assign(this.settings, normalized);
      if (normalized.contentWidthPx === undefined) delete this.settings.contentWidthPx;
    }
    this.settings.layoutPreset = presetId;
    await this.saveAndApplySettings();
  }

  async resetLayoutSettings(): Promise<void> {
    await this.performLayoutChange(
      { summary: { kind: "reset" } },
      () => this.applyLayoutPresetInMemory("default"),
    );
    new Notice("已应用推荐写作版式");
  }

  async saveCustomLayoutPreset(name: string, existingId?: string): Promise<string> {
    const id = existingId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const preset: CustomLayoutPreset = {
      id,
      name: name.trim() || "自定义版式",
      values: normalizeLayoutPresetValues(this.getCurrentLayoutSettings()),
    };
    const applyPreset = (): void => {
      const index = this.settings.customLayoutPresets.findIndex((item) => item.id === id);
      if (index >= 0) this.settings.customLayoutPresets[index] = preset;
      else this.settings.customLayoutPresets.push(preset);
      const file = this.getWritingMarkdownView()?.file;
      const documentLayout = file ? this.ensureDocumentLayoutForCurrentFile(file) : undefined;
      applySavedLayoutPresetSnapshot(this.settings, preset, documentLayout);
    };
    if (existingId) {
      applyPreset();
      await this.saveAndApplySettings();
    } else {
      await this.performLayoutChange(
        {
          summary: { kind: "save-as", presetName: preset.name },
        },
        applyPreset,
      );
    }
    new Notice(existingId ? `已更新版式模板：${preset.name}` : `已保存版式模板：${preset.name}`);
    return id;
  }

  async deleteCustomLayoutPreset(id: string): Promise<void> {
    this.invalidateLayoutHistory(this.getLayoutHistoryTargetKey());
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
    for (const rule of this.settings.autoApplyRules) {
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

  openBatchFormattingModal(request: BatchFormattingRequest): void {
    new FormattingBatchModal(this, request).open();
  }

  async applyBatchFormatting(
    request: BatchFormattingRequest,
    files: readonly TFile[],
  ): Promise<BatchFormattingResult> {
    const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
    const normalizedOrder = normalizeRuleOrder(request.ruleOrder);
    const normalizedMarkdownFormatting = normalizeMarkdownFormattingOptions(
      request.markdownFormatting,
    );
    const snapshots = [];
    const failedPaths: string[] = [];
    let processed = 0;

    for (const file of uniqueFiles) {
      try {
        let before = "";
        let after = "";
        await this.app.vault.process(file, (source) => {
          before = source;
          after = this.formatTextWithOptions(
            source,
            request.rules,
            normalizedOrder,
            normalizedMarkdownFormatting,
          );
          return after;
        });
        processed += 1;
        if (before !== after) snapshots.push({ path: file.path, before, after });
      } catch {
        failedPaths.push(file.path);
      }
    }

    this.lastBatchFormattingUndo = snapshots.length > 0 ? { snapshots } : undefined;
    this.settings.formattingPreset = request.preset;
    this.settings.formattingRules = { ...request.rules };
    this.settings.formattingRuleOrder = [...normalizedOrder];
    this.settings.markdownFormatting = normalizedMarkdownFormatting;
    await this.commitSettings();
    this.scheduleStatusUpdate();
    return {
      processed,
      changed: snapshots.length,
      failedPaths,
    };
  }

  async undoLastBatchFormatting(): Promise<BatchFormattingUndoResult> {
    const undoState = this.lastBatchFormattingUndo;
    this.lastBatchFormattingUndo = undefined;
    if (!undoState) return { restored: 0, skipped: 0 };

    let restored = 0;
    let skipped = 0;
    for (const snapshot of undoState.snapshots) {
      const file = this.app.vault.getAbstractFileByPath(snapshot.path);
      if (!(file instanceof TFile)) {
        skipped += 1;
        continue;
      }
      try {
        let restoredThisFile = false;
        await this.app.vault.process(file, (current) => {
          if (!canRestoreBatchSnapshot(current, snapshot)) return current;
          restoredThisFile = true;
          return snapshot.before;
        });
        if (restoredThisFile) restored += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    this.scheduleStatusUpdate();
    return { restored, skipped };
  }

  async saveCustomFormattingPreset(
    name: string,
    rules: FormattingRules,
    ruleOrder: readonly FormattingRuleKey[],
    existingId?: string,
    markdownFormatting: MarkdownFormattingOptions = this.settings.markdownFormatting,
  ): Promise<string> {
    const id = existingId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const normalizedMarkdownFormatting = normalizeMarkdownFormattingOptions(markdownFormatting);
    const preset: CustomFormattingPreset = {
      id,
      name: name.trim() || "自定义方案",
      rules: { ...rules },
      ruleOrder: normalizeRuleOrder(ruleOrder),
      markdownFormatting: normalizedMarkdownFormatting,
    };
    const index = this.settings.customFormattingPresets.findIndex((item) => item.id === id);
    if (index >= 0) this.settings.customFormattingPresets[index] = preset;
    else this.settings.customFormattingPresets.push(preset);
    this.settings.formattingPreset = `saved:${id}`;
    this.settings.formattingRules = { ...rules };
    this.settings.formattingRuleOrder = [...preset.ruleOrder];
    this.settings.markdownFormatting = normalizedMarkdownFormatting;
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
      this.settings.markdownFormatting = normalizeMarkdownFormattingOptions(undefined);
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
    markdownFormatting: MarkdownFormattingOptions = this.settings.markdownFormatting,
  ): Promise<void> {
    const scrollInfo = editor.getScrollInfo();
    const hasSelection = editor.somethingSelected();
    const source = hasSelection ? editor.getSelection() : editor.getValue();
    const normalizedOrder = normalizeRuleOrder(ruleOrder);
    const normalizedMarkdownFormatting = normalizeMarkdownFormattingOptions(markdownFormatting);
    const formatSource = (value: string): string => this.formatTextWithOptions(
      value,
      rules,
      normalizedOrder,
      normalizedMarkdownFormatting,
    );
    const formatted = formatSource(source);

    if (formatted === source) {
      new Notice("文本已经符合所选排版规则");
      if (saveAsDefault) {
        this.settings.formattingPreset = preset;
        this.settings.formattingRules = { ...rules };
        this.settings.formattingRuleOrder = [...normalizedOrder];
        this.settings.markdownFormatting = normalizedMarkdownFormatting;
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
      const formattedPrefixLength = formatSource(source.slice(0, cursorOffset)).length;
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
      this.settings.markdownFormatting = normalizedMarkdownFormatting;
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

  private formatTextWithOptions(
    source: string,
    rules: FormattingRules,
    ruleOrder: readonly FormattingRuleKey[],
    markdownFormatting: MarkdownFormattingOptions,
  ): string {
    return applyFormattingPipeline(
      source,
      rules,
      ruleOrder,
      markdownFormatting,
    );
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
      DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
    );
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
