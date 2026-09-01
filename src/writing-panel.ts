import {
  ItemView,
  MarkdownView,
  Modal,
  Platform,
  Setting,
  setIcon,
  type WorkspaceLeaf,
} from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import {
  analyzeChineseText,
  countWritingText,
  type TextDiagnostic,
} from "./text-analysis";
import {
  FontPickerModal,
  getFontSelectionDisplayName,
  getFontSelectionPreviewFamily,
} from "./font-options";
import { fontSelectionToLegacyFontFamily, type FontRole } from "./font-selection";
import { READER_MODE_ENABLED } from "./reader/reader-constants";
import {
  formatFontSize,
  formatLetterSpacing,
  formatLineHeight,
  getObsidianFontDisplayName,
  readObsidianTypographyBaseline,
} from "./obsidian-baseline";
import {
  HEADING_LEVELS,
  TYPEWRITER_CURSOR_POSITIONS,
  PAPER_THEME_OPTIONS,
  type InterfaceAccentMode,
  type FontSelection,
  type LayoutPresetValues,
  type LayoutPresetId,
  type PaperTheme,
} from "./types";

export const WRITING_PANEL_VIEW_TYPE = "chinese-writing-layout-panel";

const DIAGNOSTIC_LABELS = {
  "halfwidth-punctuation": "半角标点",
  "repeated-punctuation": "重复标点",
  "unmatched-pair": "符号未配对",
  "raw-indentation": "手工缩进",
};

type NumericSettingKey =
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "paragraphSpacing"
  | "firstLineIndent"
  | "contentWidth"
  | "leftMargin"
  | "rightMargin";

type FontSettingKey =
  | "fontFamily"
  | "headingFontFamily"
  | "quoteFontFamily"
  | "boldFontFamily"
  | "italicFontFamily";

type FontSelectionSettingKey =
  | "bodyFont"
  | "headingFont"
  | "quoteFont"
  | "boldFont"
  | "italicFont";

const FONT_SETTING_CONFIG: Record<FontSettingKey, {
  selectionKey: FontSelectionSettingKey;
  role: FontRole;
}> = {
  fontFamily: { selectionKey: "bodyFont", role: "body" },
  headingFontFamily: { selectionKey: "headingFont", role: "heading" },
  quoteFontFamily: { selectionKey: "quoteFont", role: "quote" },
  boldFontFamily: { selectionKey: "boldFont", role: "bold" },
  italicFontFamily: { selectionKey: "italicFont", role: "italic" },
};

interface SliderDefinition {
  key: NumericSettingKey;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  unit: string;
}

const SLIDERS: SliderDefinition[] = [
  {
    key: "fontSize",
    label: "字号",
    minimum: 14,
    maximum: 28,
    step: 1,
    unit: "px",
  },
  {
    key: "lineHeight",
    label: "行距",
    minimum: 1.4,
    maximum: 2.6,
    step: 0.1,
    unit: "倍",
  },
  {
    key: "letterSpacing",
    label: "字距",
    minimum: -1,
    maximum: 4,
    step: 0.1,
    unit: "px",
  },
  {
    key: "paragraphSpacing",
    label: "段距",
    minimum: 0,
    maximum: 2,
    step: 0.1,
    unit: "em",
  },
  {
    key: "firstLineIndent",
    label: "缩进",
    minimum: 0,
    maximum: 4,
    step: 0.5,
    unit: "字符",
  },
  {
    key: "contentWidth",
    label: "正文宽度",
    minimum: 28,
    maximum: 72,
    step: 1,
    unit: "字宽",
  },
  {
    key: "leftMargin",
    label: "左间距",
    minimum: 0,
    maximum: 12,
    step: 0.5,
    unit: "字符",
  },
  {
    key: "rightMargin",
    label: "右间距",
    minimum: 0,
    maximum: 12,
    step: 0.5,
    unit: "字符",
  },
];

class LayoutPresetNameModal extends Modal {
  constructor(
    plugin: ChineseWritingLayoutPlugin,
    private onSubmit: (name: string) => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.setTitle("保存版式模板");
    let value = "";
    const setting = new Setting(this.contentEl)
      .setName("模板名称")
      .setDesc("例如：舒适写作、宽屏校稿、夜间阅读")
      .addText((text) => {
        text.setPlaceholder("我的版式").onChange((next) => { value = next; });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });
    setting.addButton((button) =>
      button.setButtonText("保存").setCta().onClick(() => {
        const name = value.trim();
        if (!name) return;
        this.close();
        this.onSubmit(name);
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class LayoutPresetOverwriteTargetModal extends Modal {
  private selectedId: string;

  constructor(
    plugin: ChineseWritingLayoutPlugin,
    private presets: readonly { id: string; name: string }[],
    private onSelect: (presetId: string) => void,
  ) {
    super(plugin.app);
    this.selectedId = presets[0]?.id ?? "";
  }

  onOpen(): void {
    this.setTitle("覆盖已有版式模板");
    this.contentEl.createEl("p", {
      text: "选择要用当前版式覆盖的自定义模板。下一步还会再次确认。",
      cls: "setting-item-description",
    });
    new Setting(this.contentEl)
      .setName("目标模板")
      .addDropdown((dropdown) => {
        for (const preset of this.presets) dropdown.addOption(preset.id, preset.name);
        return dropdown
          .setValue(this.selectedId)
          .onChange((value) => { this.selectedId = value; });
      });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText("下一步")
        .setCta()
        .onClick(() => {
          if (!this.selectedId) return;
          const selectedId = this.selectedId;
          this.close();
          this.onSelect(selectedId);
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class LayoutPresetOverwriteConfirmModal extends Modal {
  constructor(
    plugin: ChineseWritingLayoutPlugin,
    private presetName: string,
    private onConfirm: () => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.setTitle("确认覆盖版式模板");
    this.contentEl.createEl("p", {
      text: `确定用当前版式覆盖“${this.presetName}”吗？使用该模板的其他笔记也会采用更新后的版式。`,
    });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText("确认覆盖")
        .setWarning()
        .onClick(() => {
          this.close();
          this.onConfirm();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class WritingPanelView extends ItemView {
  private plugin: ChineseWritingLayoutPlugin;
  private fontAdvancedOpen = false;
  private headingCenteringOpen = false;

  private panelScrollTop = 0;
  private restoringPanelScroll = false;
  private restoreScrollFrame?: number;
  private panelTouchActive = false;
  private refreshPendingAfterTouch = false;
  private panelTouchFinishTimer?: number;
  private layoutLocateTimer?: number;

  private rememberPanelScroll = (): void => {
    if (!this.restoringPanelScroll) {
      this.panelScrollTop = this.contentEl.scrollTop;
    }
    if (this.panelTouchActive && this.panelTouchFinishTimer !== undefined) {
      this.finishPanelTouch();
    }
  };

  private cancelPendingScrollRestore(): void {
    if (this.restoreScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreScrollFrame);
      this.restoreScrollFrame = undefined;
    }
    this.restoringPanelScroll = false;
  }

  private interruptPanelScrollRestore = (): void => {
    if (this.panelTouchFinishTimer !== undefined) {
      window.clearTimeout(this.panelTouchFinishTimer);
      this.panelTouchFinishTimer = undefined;
    }
    if (this.layoutLocateTimer !== undefined) {
      window.clearTimeout(this.layoutLocateTimer);
      this.layoutLocateTimer = undefined;
    }
    this.panelTouchActive = true;
    this.cancelPendingScrollRestore();
    this.panelScrollTop = this.contentEl.scrollTop;
  };

  private finishPanelTouch = (): void => {
    if (this.panelTouchFinishTimer !== undefined) {
      window.clearTimeout(this.panelTouchFinishTimer);
    }
    this.panelTouchFinishTimer = window.setTimeout(() => {
      this.panelTouchFinishTimer = undefined;
      this.panelTouchActive = false;
      if (!this.refreshPendingAfterTouch) return;
      this.refreshPendingAfterTouch = false;
      this.refresh();
    }, 180);
  };

  constructor(leaf: WorkspaceLeaf, plugin: ChineseWritingLayoutPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WRITING_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "中文写作排版";
  }

  getIcon(): string {
    return "book-type";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("cw-panel-view");

    this.contentEl.addEventListener(
      "scroll",
      this.rememberPanelScroll,
      { passive: true },
    );
    this.contentEl.addEventListener(
      "touchstart",
      this.interruptPanelScrollRestore,
      { passive: true },
    );
    this.contentEl.addEventListener("touchend", this.finishPanelTouch, { passive: true });
    this.contentEl.addEventListener("touchcancel", this.finishPanelTouch, { passive: true });

    this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.removeEventListener(
      "scroll",
      this.rememberPanelScroll,
    );
    this.contentEl.removeEventListener(
      "touchstart",
      this.interruptPanelScrollRestore,
    );
    this.contentEl.removeEventListener("touchend", this.finishPanelTouch);
    this.contentEl.removeEventListener("touchcancel", this.finishPanelTouch);

    this.cancelPendingScrollRestore();
    if (this.panelTouchFinishTimer !== undefined) {
      window.clearTimeout(this.panelTouchFinishTimer);
      this.panelTouchFinishTimer = undefined;
    }
    if (this.layoutLocateTimer !== undefined) {
      window.clearTimeout(this.layoutLocateTimer);
      this.layoutLocateTimer = undefined;
    }
    this.panelTouchActive = false;
    this.refreshPendingAfterTouch = false;

    this.contentEl.empty();
  }

  refresh(): void {
    if (this.panelTouchActive) {
      this.refreshPendingAfterTouch = true;
      return;
    }
    const container = this.contentEl;

    const previousScrollTop = this.restoringPanelScroll
      ? this.panelScrollTop
      : container.scrollTop;

    this.cancelPendingScrollRestore();

    const restoreScroll = (): void => {
      this.restoringPanelScroll = true;

      this.restoreScrollFrame = window.requestAnimationFrame(() => {
        const maxScrollTop = Math.max(
          0,
          container.scrollHeight - container.clientHeight,
        );

        container.scrollTop = Math.min(
          previousScrollTop,
          maxScrollTop,
        );

        this.panelScrollTop = container.scrollTop;
        this.restoringPanelScroll = false;
        this.restoreScrollFrame = undefined;
      });
    };

    container.empty();
    container.addClass("cw-panel-content");

    const header = container.createDiv({ cls: "cw-panel-header" });
    const emblem = header.createDiv({ cls: "cw-panel-emblem" });
    setIcon(emblem, "feather");
    const brand = header.createDiv({ cls: "cw-panel-brand" });
    brand.createDiv({ text: "WRITING STUDIO", cls: "cw-panel-eyebrow" });
    brand.createEl("h2", { text: "写作工坊" });
    brand.createDiv({ text: "中文小说排版与校对", cls: "cw-panel-subtitle" });
    header.createEl("span", {
      text: this.plugin.manifest.version,
      cls: "cw-panel-version",
    });

    const view = this.plugin.getWritingMarkdownView();
    if (!view?.file) {
      container.createDiv({
        text: "请先打开一篇 Markdown 笔记。",
        cls: "cw-panel-empty",
      });
      this.renderGlobalControls(container);
      restoreScroll();
      return;
    }

    const isNovel = this.plugin.isNovelFile(view.file);
    const writingContext = this.plugin.getWritingContextForFile(view.file);
    const documentWritingMode = this.plugin.getCurrentDocumentWritingMode();
    const noteCard = container.createDiv({ cls: "cw-panel-note-card" });
    const noteMain = noteCard.createDiv({ cls: "cw-panel-note-main" });
    const noteCopy = noteMain.createDiv({ cls: "cw-panel-note-copy" });
    noteCopy.createDiv({ text: "当前笔记", cls: "cw-panel-note-label" });
    noteCopy.createDiv({ text: view.file.basename, cls: "cw-panel-note-title" });
    const modeButton = noteMain.createEl("button", {
      text: isNovel ? "已开启" : "写作模式",
      cls: `cw-panel-mode-button${isNovel ? " is-active" : ""}`,
      attr: {
        type: "button",
        "aria-pressed": String(isNovel),
        "aria-label": isNovel ? "写作模式已开启，点击关闭" : "写作模式未开启，点击开启",
        title: isNovel ? "点击关闭写作模式" : "点击开启写作模式",
      },
    });
    noteCard.createDiv({
      text: documentWritingMode
        ? documentWritingMode === "force-on"
          ? "当前笔记已手动强制开启；可随时恢复跟随自动规则。"
          : "当前笔记已手动强制关闭；自动规则不会再次把它打开。"
        : writingContext.activationSource.kind === "rule"
          ? "当前由第一条匹配的自动规则决定。"
          : writingContext.activationSource.kind === "legacy-activation-class"
            ? `当前由兼容 CSS Class：${writingContext.activationSource.cssClass} 开启。`
            : isNovel
              ? "当前跟随全局默认开启。"
              : "当前跟随自动规则与全局默认。",
      cls: "cw-panel-note-help",
    });
    const layoutSourceStatus = this.plugin.getCurrentLayoutSourceStatus();
    const layoutSourceButton = noteCard.createEl("button", {
      text: `版式来源：${layoutSourceStatus}`,
      cls: "cw-panel-layout-source",
      attr: {
        type: "button",
        "aria-label": `当前版式来源：${layoutSourceStatus}；点击前往版式微调`,
        title: "点击前往版式微调",
      },
    });
    layoutSourceButton.addEventListener("click", () => this.locateLayoutScope());
    if (documentWritingMode) {
      const followButton = noteCard.createEl("button", {
        text: "恢复跟随自动规则",
        cls: "cw-panel-follow-rules-button",
        attr: { type: "button" },
      });
      followButton.addEventListener("click", () => {
        void this.plugin.clearCurrentDocumentWritingMode().then(() => this.refresh());
      });
    }
    modeButton.addEventListener("click", () => {
      void this.plugin.toggleNovelMode(view.file!).then(() => this.refresh());
    });

    const text = view.editor.getValue();
    const diagnostics = analyzeChineseText(text);
    const stats = container.createDiv({ cls: "cw-panel-stats" });
    this.addStat(
      stats,
      countWritingText(text, this.plugin.settings.countMode).toLocaleString(),
      this.plugin.settings.countMode === "creative" ? "创作字数" : "正文字符",
    );
    this.addStat(stats, diagnostics.length.toLocaleString(), "写作提示");

    this.renderFormattingLauncher(container);
    this.renderQuickTools(container, isNovel);
    this.renderGlobalControls(container);
    this.renderDiagnostics(container, view, diagnostics, isNovel);
    restoreScroll();
  }

  private addStat(container: HTMLElement, value: string, label: string): void {
    const stat = container.createDiv({ cls: "cw-panel-stat" });
    stat.createDiv({ text: value, cls: "cw-panel-stat-value" });
    stat.createDiv({ text: label, cls: "cw-panel-stat-label" });
  }

  private renderGlobalControls(container: HTMLElement): void {
    const section = container.createDiv({ cls: "cw-panel-section" });
    const heading = section.createDiv({ cls: "cw-panel-section-heading" });
    const headingTitle = heading.createEl("h3", { text: "版式微调" });
    headingTitle.setAttribute("aria-label", "版式微调");
    const historyActions = heading.createDiv({ cls: "cw-panel-layout-history" });
    const undoButton = historyActions.createEl("button", {
      attr: {
        type: "button",
        "aria-label": "撤回版式修改",
        title: "撤回版式修改",
      },
    });
    setIcon(undoButton, "undo-2");
    undoButton.disabled = !this.plugin.canUndoCurrentLayoutChange();
    undoButton.addEventListener("click", () => {
      void this.plugin.undoCurrentLayoutChange();
    });
    const redoButton = historyActions.createEl("button", {
      attr: {
        type: "button",
        "aria-label": "恢复版式修改",
        title: "恢复版式修改",
      },
    });
    setIcon(redoButton, "redo-2");
    redoButton.disabled = !this.plugin.canRedoCurrentLayoutChange();
    redoButton.addEventListener("click", () => {
      void this.plugin.redoCurrentLayoutChange();
    });
    heading.createSpan({ text: "只改变显示", cls: "cw-panel-section-note" });
    section.createDiv({
      text: "写作模式开启后生效；这里的设置不会改写 Markdown 正文，并可保存为自定义模板。",
      cls: "cw-panel-help cw-panel-layout-help",
    });
    const obsidianBaseline = readObsidianTypographyBaseline();
    section.createDiv({
      text: `Obsidian 当前字体：${getObsidianFontDisplayName(obsidianBaseline.fontFamily)} · ${formatFontSize(obsidianBaseline.fontSize)} · 字距：${formatLetterSpacing(obsidianBaseline.letterSpacing)} · ${formatLineHeight(obsidianBaseline.lineHeight)} 倍行距`,
      cls: "cw-panel-help cw-panel-obsidian-baseline",
    });

    const scope = section.createDiv({ cls: "cw-panel-layout-scope" });
    const scopeLabel = scope.createEl("label");
    scopeLabel.createSpan({ text: "此笔记使用独立版式" });
    const scopeToggle = scopeLabel.createEl("input", { type: "checkbox" });
    const hasCurrentFile = Boolean(this.plugin.getWritingMarkdownView()?.file);
    scopeToggle.checked = this.plugin.isCurrentDocumentLayoutEnabled();
    scopeToggle.disabled = !hasCurrentFile;
    const automaticRule = this.plugin.getCurrentAutoApplyRule();
    const automaticRuleLabel = automaticRule
      ? automaticRule.kind === "folder"
        ? `文件夹：${automaticRule.folderPath}`
        : automaticRule.kind === "tag"
          ? `Tag：${automaticRule.tag}`
          : automaticRule.kind === "filename"
            ? `文件名：${automaticRule.pattern}`
            : `CSS Class：${automaticRule.cssClass}`
      : "";
    scope.createDiv({
      text: scopeToggle.checked
        ? "下方设置和模板只影响当前笔记。"
        : automaticRule
          ? `已匹配${automaticRuleLabel}，自动使用“${this.plugin.getLayoutPresetLabel(automaticRule.layoutPreset)}”；调整下方设置会转为当前笔记独立版式。`
        : "关闭时使用全局版式，调整会影响其他未独立设置的笔记。",
      cls: "cw-panel-layout-scope-help",
    });
    scopeToggle.addEventListener("change", () => {
      void this.plugin.setCurrentDocumentLayoutEnabled(scopeToggle.checked)
        .then(() => this.refresh());
    });

    const layout = this.plugin.getCurrentLayoutSettings();

    this.renderLayoutPresetControls(section);
    this.renderFontControls(section, layout);

    for (const definition of SLIDERS) {
      this.addSlider(section, definition);
    }

    const themeRow = section.createDiv({ cls: "cw-panel-control-row cw-panel-select-row" });
    themeRow.createEl("label", { text: "纸张" });
    const themeSelect = themeRow.createEl("select");
    for (const option of PAPER_THEME_OPTIONS) {
      themeSelect.createEl("option", { value: option.value, text: option.label });
    }
    themeSelect.value = layout.paperTheme;
    themeSelect.addEventListener("change", () => {
      void this.plugin.performLayoutChange(
        {
          mergeKey: "field:paperTheme",
          summary: { kind: "field", key: "paperTheme" },
        },
        () => {
          this.markLayoutPresetEdited();
          this.plugin.previewLayoutSettings({ paperTheme: themeSelect.value as PaperTheme });
        },
      );
    });

    const imageRow = section.createDiv({ cls: "cw-panel-control-row" });
    imageRow.createEl("label", { text: "背景图片" });
    const imageSelect = imageRow.createEl("select");
    imageSelect.createEl("option", { value: "", text: "不使用图片" });
    for (const file of this.plugin.getAvailablePaperImages()) {
      imageSelect.createEl("option", { value: file.path, text: file.path });
    }
    imageSelect.value = layout.customPaperImage;
    imageRow.toggleClass("cw-panel-control-hidden", themeSelect.value !== "custom");
    themeSelect.addEventListener("change", () => {
      imageRow.toggleClass("cw-panel-control-hidden", themeSelect.value !== "custom");
    });
    imageSelect.addEventListener("change", () => {
      void this.plugin.performLayoutChange(
        {
          mergeKey: "field:customPaperImage",
          summary: { kind: "field", key: "customPaperImage" },
        },
        () => {
          this.markLayoutPresetEdited();
          this.plugin.previewLayoutSettings({
            customPaperImage: imageSelect.value,
            paperTheme: imageSelect.value
              ? "custom"
              : this.plugin.getCurrentLayoutSettings().paperTheme,
          });
          if (imageSelect.value) themeSelect.value = "custom";
        },
      );
    });

    this.renderHeadingCenteringControls(section);
    this.addToggle(section, "两端对齐", "justifyText", "cw-panel-justify-row");

    section.createDiv({ cls: "cw-panel-alignment-divider" });

    this.renderLayoutResetAction(section);

    section.createDiv({ text: "写作辅助", cls: "cw-panel-subsection-label" });
    this.addToggle(section, "标点提示", "showDiagnostics");
    this.addToggle(section, "状态栏统计", "showStatusBar");
    this.renderInterfaceAccentControls(section);
  }

  private locateLayoutScope(): void {
    const scope = this.contentEl.querySelector<HTMLElement>(".cw-panel-layout-scope");
    const scopeToggle = this.contentEl.querySelector<HTMLInputElement>(".cw-panel-layout-scope input");
    if (!scope || !scopeToggle) return;
    this.cancelPendingScrollRestore();
    const targetTop = this.contentEl.scrollTop
      + scope.getBoundingClientRect().top
      - this.contentEl.getBoundingClientRect().top
      - 12;
    this.contentEl.scrollTop = Math.max(0, targetTop);
    this.panelScrollTop = this.contentEl.scrollTop;
    scopeToggle.focus({ preventScroll: true });
    scope.removeClass("is-located");
    window.requestAnimationFrame(() => scope.addClass("is-located"));
    if (this.layoutLocateTimer !== undefined) window.clearTimeout(this.layoutLocateTimer);
    this.layoutLocateTimer = window.setTimeout(() => {
      scope.removeClass("is-located");
      this.layoutLocateTimer = undefined;
    }, 1400);
  }

  private renderHeadingCenteringControls(section: HTMLElement): void {
    const details = section.createEl("details", {
      cls: "cw-panel-font-help cw-panel-heading-centering",
    });
    details.open = this.headingCenteringOpen;
    details.addEventListener("toggle", () => {
      this.headingCenteringOpen = details.open;
    });

    const summary = details.createEl("summary");
    summary.createSpan({ text: "标题居中", cls: "cw-panel-heading-summary-label" });
    const state = summary.createSpan({
      text: this.getHeadingCenteringStateLabel(),
      cls: "cw-panel-heading-state",
    });
    details.createDiv({
      text: "只在写作模式下生效；展开后可选择需要居中的 Markdown 标题级别。",
      cls: "cw-panel-heading-help",
    });

    const toggleRow = details.createDiv({
      cls: "cw-panel-compact-row cw-panel-heading-toggle",
    });
    const toggleLabel = toggleRow.createEl("label");
    toggleLabel.createSpan({ text: "启用标题居中" });
    const toggle = toggleLabel.createEl("input", {
      type: "checkbox",
      attr: { "aria-label": "启用标题居中" },
    });
    toggle.checked = this.plugin.settings.centerHeadings;

    const fieldset = details.createEl("fieldset", {
      cls: "cw-panel-heading-levels",
    });
    fieldset.disabled = !toggle.checked;
    fieldset.createEl("legend", { text: "居中标题级别" });
    const options = fieldset.createDiv({ cls: "cw-panel-heading-level-options" });
    const selected = new Set(this.plugin.settings.centerHeadingLevels);
    for (const level of HEADING_LEVELS) {
      const label = options.createEl("label", {
        cls: "cw-panel-heading-level-option",
      });
      const input = label.createEl("input", {
        type: "checkbox",
        attr: {
          "aria-label": `标题 H${level} 居中`,
          "data-cw-heading-level": `${level}`,
        },
      });
      input.checked = selected.has(level);
      label.createSpan({ text: `H${level}` });
      input.addEventListener("change", () => {
        if (input.checked) selected.add(level);
        else selected.delete(level);
        this.plugin.previewSettings({
          centerHeadingLevels: HEADING_LEVELS.filter((candidate) => selected.has(candidate)),
        });
        state.setText(this.getHeadingCenteringStateLabel());
        void this.plugin.commitSettings();
      });
    }

    toggle.addEventListener("change", () => {
      fieldset.disabled = !toggle.checked;
      this.plugin.previewSettings({ centerHeadings: toggle.checked });
      state.setText(this.getHeadingCenteringStateLabel());
      void this.plugin.commitSettings();
    });
  }

  private getHeadingCenteringStateLabel(): string {
    if (!this.plugin.settings.centerHeadings) return "关闭";
    const count = this.plugin.settings.centerHeadingLevels.length;
    return count > 0 ? `已开启 · ${count} 个级别` : "已开启 · 未选择级别";
  }

  private renderLayoutResetAction(section: HTMLElement): void {
    const isDocumentLayout = this.plugin.isCurrentDocumentLayoutEnabled()
      || Boolean(this.plugin.getCurrentAutoApplyRule());
    const resetPresetId = this.plugin.getCurrentLayoutResetPresetId();
    const resetPresetLabel = resetPresetId
      ? this.plugin.getLayoutPresetLabel(resetPresetId)
      : "上次选择的模板";
    const resetButton = section.createEl("button", {
      cls: "cw-panel-layout-reset",
      attr: {
        type: "button",
        "aria-label": `恢复上次选择的模板：${resetPresetLabel}`,
      },
    });
    resetButton.disabled = resetPresetId === null;
    const icon = resetButton.createSpan({ cls: "cw-panel-layout-reset-icon" });
    setIcon(icon, "rotate-ccw");
    const copy = resetButton.createSpan({ cls: "cw-panel-layout-reset-copy" });
    copy.createSpan({ text: "恢复上次选择的模板", cls: "cw-panel-layout-reset-title" });
    copy.createSpan({
      text: resetPresetId === null
        ? "当前没有可恢复的上次选择模板"
        : `${isDocumentLayout ? "当前笔记" : "全局"}恢复为“${resetPresetLabel}”的原始参数`,
      cls: "cw-panel-layout-reset-description",
    });
    resetButton.addEventListener("click", () => {
      void this.plugin.resetCurrentLayoutPreset().then(() => this.refresh());
    });
  }

  private renderInterfaceAccentControls(section: HTMLElement): void {
    section.createDiv({ text: "操作界面", cls: "cw-panel-subsection-label" });
    const modeRow = section.createDiv({ cls: "cw-panel-control-row cw-panel-select-row" });
    modeRow.createEl("label", { text: "重点色" });
    const modeSelect = modeRow.createEl("select");
    modeSelect.createEl("option", { value: "theme", text: "跟随系统皮肤" });
    modeSelect.createEl("option", { value: "custom", text: "自定义" });
    modeSelect.value = this.plugin.settings.interfaceAccentMode;

    const colorRow = section.createDiv({ cls: "cw-panel-control-row cw-panel-color-row" });
    colorRow.createEl("label", { text: "自定义颜色" });
    const colorInput = colorRow.createEl("input", { type: "color" });
    colorInput.value = this.plugin.settings.interfaceAccentColor;
    colorRow.toggleClass(
      "cw-panel-control-hidden",
      this.plugin.settings.interfaceAccentMode !== "custom",
    );

    modeSelect.addEventListener("change", () => {
      const mode = modeSelect.value as InterfaceAccentMode;
      colorRow.toggleClass("cw-panel-control-hidden", mode !== "custom");
      this.plugin.previewSettings({ interfaceAccentMode: mode });
      void this.plugin.commitSettings();
    });
    colorInput.addEventListener("input", () => {
      this.plugin.previewSettings({
        interfaceAccentMode: "custom",
        interfaceAccentColor: colorInput.value,
      });
    });
    colorInput.addEventListener("change", () => void this.plugin.commitSettings());
  }

  private renderLayoutPresetControls(section: HTMLElement): void {
    const box = section.createDiv({ cls: "cw-panel-layout-presets" });
    box.createDiv({ text: "版式模板", cls: "cw-panel-preset-label" });
    const controls = box.createDiv({ cls: "cw-panel-preset-controls" });
    const select = controls.createEl("select", {
      attr: { "aria-label": "版式模板" },
    });
    const currentPresetId = this.plugin.getCurrentLayoutPresetId();
    const followObsidianAdjusted = currentPresetId === "obsidian"
      && this.plugin.hasCurrentFollowObsidianOverrides();
    if (followObsidianAdjusted) {
      select.createEl("option", {
        value: "obsidian-adjusted",
        text: "跟随 Obsidian（已微调）",
      });
    }
    select.createEl("option", {
      value: "obsidian",
      text: followObsidianAdjusted ? "跟随 Obsidian（恢复原始）" : "跟随 Obsidian",
    });
    select.createEl("option", { value: "default", text: "推荐写作版式" });
    select.createEl("option", { value: "custom", text: "当前自定义设置" });
    for (const preset of this.plugin.settings.customLayoutPresets) {
      select.createEl("option", { value: `saved:${preset.id}`, text: preset.name });
    }
    select.value = followObsidianAdjusted ? "obsidian-adjusted" : currentPresetId;
    select.addEventListener("change", () => {
      if (select.value === "obsidian-adjusted") return;
      const presetId = select.value as LayoutPresetId;
      if (presetId === "custom") return;
      void this.plugin.applyLayoutPreset(presetId).then(() => this.refresh());
    });

    const saveAs = controls.createEl("button", {
      text: "另存",
      attr: {
        type: "button",
        title: "另存为新模板",
      },
    });
    saveAs.addEventListener("click", () => {
      new LayoutPresetNameModal(this.plugin, (name) => {
        void this.plugin.saveCustomLayoutPreset(name).then(() => this.refresh());
      }).open();
    });

    const overwrite = controls.createEl("button", {
      text: "覆盖",
      attr: {
        type: "button",
        title: this.plugin.settings.customLayoutPresets.length > 0
          ? "用当前版式覆盖一个已有模板"
          : "尚未保存自定义模板",
      },
    });
    overwrite.disabled = this.plugin.settings.customLayoutPresets.length === 0;
    overwrite.addEventListener("click", () => {
      new LayoutPresetOverwriteTargetModal(
        this.plugin,
        this.plugin.settings.customLayoutPresets,
        (presetId) => this.confirmOverwriteLayoutPreset(presetId),
      ).open();
    });

    const currentPreset = this.plugin.getCurrentLayoutPresetId();
    const savedId = currentPreset.startsWith("saved:")
      ? currentPreset.slice("saved:".length)
      : null;
    if (savedId) {
      const actions = box.createDiv({ cls: "cw-panel-preset-actions" });
      const preset = this.plugin.settings.customLayoutPresets.find((item) => item.id === savedId);
      const update = actions.createEl("button", {
        text: "保存修改",
        attr: { type: "button" },
      });
      update.addEventListener("click", () => this.confirmOverwriteLayoutPreset(savedId));
      const remove = actions.createEl("button", {
        text: "删除",
        attr: { type: "button" },
      });
      remove.addEventListener("click", () => {
        void this.plugin.deleteCustomLayoutPreset(savedId).then(() => this.refresh());
      });
    }
  }

  private confirmOverwriteLayoutPreset(presetId: string): void {
    const preset = this.plugin.settings.customLayoutPresets.find((item) => item.id === presetId);
    if (!preset) return;
    new LayoutPresetOverwriteConfirmModal(this.plugin, preset.name, () => {
      void this.plugin.saveCustomLayoutPreset(preset.name, preset.id)
        .then(() => this.refresh());
    }).open();
  }

  private markLayoutPresetEdited(): void {
    this.plugin.markLayoutPresetEdited();
  }

  private renderFontControls(section: HTMLElement, layout: LayoutPresetValues): void {
    const picker = section.createDiv({ cls: "cw-panel-font-picker" });
    picker.createDiv({ text: "字体", cls: "cw-panel-preset-label" });
    this.addFontControlRow(picker, "正文", "fontFamily", layout);
    this.addFontControlRow(picker, "标题", "headingFontFamily", layout);

    const advanced = picker.createEl("details", { cls: "cw-panel-font-help" });
    advanced.open = this.fontAdvancedOpen;
    advanced.addEventListener("toggle", () => {
      this.fontAdvancedOpen = advanced.open;
    });
    advanced.createEl("summary", { text: "更多字体设置" });
    this.addFontControlRow(advanced, "引用", "quoteFontFamily", layout);
    this.addFontControlRow(advanced, "粗体", "boldFontFamily", layout);
    this.addFontControlRow(advanced, "斜体", "italicFontFamily", layout);
    advanced.createEl("p", {
      text: "引用对应 > 段落，粗体对应 **文字**，斜体对应 *文字*。三项可以分别设置；字体窗口也提供手动字体列表与安装说明。",
    });
  }

  private addFontControlRow(
    container: HTMLElement,
    label: string,
    key: FontSettingKey,
    layout: LayoutPresetValues,
  ): void {
    const config = FONT_SETTING_CONFIG[key];
    const currentSelection = layout[config.selectionKey];
    const displayName = getFontSelectionDisplayName(
      currentSelection,
      this.plugin.settings.userFonts,
    );
    const button = container.createEl("button", {
      cls: "cw-panel-font-row",
      attr: {
        type: "button",
        "aria-label": `${label}字体：${displayName}`,
      },
    });
    button.createSpan({ text: label, cls: "cw-panel-font-row-label" });
    const value = button.createSpan({
      text: displayName,
      cls: "cw-panel-font-row-value",
    });
    value.style.fontFamily = getFontSelectionPreviewFamily(
      currentSelection,
      this.plugin.settings.userFonts,
    );
    const arrow = button.createSpan({ cls: "cw-panel-font-row-arrow" });
    setIcon(arrow, "chevron-right");
    button.addEventListener("click", () => {
      new FontPickerModal(
        this.app,
        label,
        currentSelection,
        this.plugin.settings.userFonts,
        (selection: FontSelection) => {
        void this.plugin.performLayoutChange(
          {
            mergeKey: `field:${key}`,
            summary: { kind: "field", key },
          },
          () => {
            this.markLayoutPresetEdited();
            this.plugin.previewLayoutSettings({
              [config.selectionKey]: selection,
              [key]: fontSelectionToLegacyFontFamily(selection, config.role),
            } as Partial<LayoutPresetValues>);
          },
        );
        },
        {
          ...this.plugin.getFontPickerUserFontActions(),
          onUserFontsChanged: () => this.refresh(),
        },
      ).open();
    });
  }

  private renderQuickTools(container: HTMLElement, isNovel: boolean): void {
    const section = container.createDiv({ cls: "cw-panel-tool-section" });
    const heading = section.createDiv({ cls: "cw-panel-section-heading" });
    heading.createEl("h3", { text: "快捷工具" });
    if (!isNovel) {
      heading.createSpan({ text: "先启用写作模式", cls: "cw-panel-section-note" });
    }

    const grid = section.createDiv({ cls: "cw-panel-tool-grid" });
    if (READER_MODE_ENABLED) {
      this.addToolButton(
        grid,
        "book-open",
        "阅读模式",
        "读者视角检查正文",
        false,
        () => this.plugin.openReaderModeModal(),
        !this.plugin.getWritingMarkdownView()?.file,
      );
    }
    this.addToolButton(
      grid,
      "align-center-vertical",
      "打字机",
      "输入行居中",
      this.plugin.isTypewriterModeEnabled(),
      () => void this.plugin.toggleTypewriterMode(),
      !this.plugin.getWritingMarkdownView()?.file,
    );
    this.addToolButton(
      grid,
      "maximize-2",
      "专注模式",
      "隐藏界面干扰",
      this.plugin.isFocusModeEnabled(),
      () => this.plugin.toggleFocusMode(),
    );
    this.addToolButton(
      grid,
      "file-down",
      "导出文本",
      "TXT / Word / PNG",
      false,
      () => this.plugin.openExportModal(),
    );
    this.addToolButton(
      grid,
      "folder-open",
      "最近导出",
      Platform.isMobileApp ? "移动端不可用" : "打开最近的本地导出文件夹",
      false,
      () => void this.plugin.openExportFolder(),
      Platform.isMobileApp,
    );
    this.addToolButton(
      grid,
      "search",
      "查找替换",
      "使用 Obsidian 原生功能",
      false,
      () => this.plugin.openNativeFindReplace(),
    );
    this.addToolButton(
      grid,
      "history",
      "历史版本",
      "使用 Obsidian 文件恢复",
      false,
      () => this.plugin.openFileRecoverySnapshots(),
    );

    const typewriterOptions = section.createDiv({ cls: "cw-panel-typewriter-options" });
    const positionRow = typewriterOptions.createDiv({ cls: "cw-panel-compact-row" });
    positionRow.createEl("label", { text: "光标位置" });
    const positionSelect = positionRow.createEl("select");
    for (const position of TYPEWRITER_CURSOR_POSITIONS) {
      positionSelect.createEl("option", { value: `${position}`, text: `${position}%` });
    }
    positionSelect.value = `${this.plugin.settings.typewriterCursorPosition}`;
    positionSelect.addEventListener("change", () => {
      this.plugin.previewSettings({
        typewriterCursorPosition: Number(positionSelect.value),
      });
      void this.plugin.commitSettings();
    });

    const highlightRow = typewriterOptions.createDiv({ cls: "cw-panel-compact-row" });
    const highlightLabel = highlightRow.createEl("label");
    highlightLabel.createSpan({ text: "高亮当前行" });
    const highlightInput = highlightLabel.createEl("input", { type: "checkbox" });
    highlightInput.checked = this.plugin.settings.highlightCurrentLine;
    highlightInput.addEventListener("change", () => {
      this.plugin.previewSettings({ highlightCurrentLine: highlightInput.checked });
      void this.plugin.commitSettings();
    });
  }

  private renderFormattingLauncher(container: HTMLElement): void {
    const launcher = container.createDiv({
      cls: "cw-panel-format-launcher",
    });
    const primary = launcher.createEl("button", {
      cls: "cw-panel-format-primary",
      attr: {
        type: "button",
        "aria-label": "使用当前默认方案一键排版",
        title: "使用当前默认方案一键排版",
      },
    });
    const icon = primary.createSpan({ cls: "cw-panel-format-icon" });
    setIcon(icon, "wand-sparkles");
    const copy = primary.createSpan({ cls: "cw-panel-format-copy" });
    copy.createSpan({ text: "一键排版", cls: "cw-panel-format-title" });
    copy.createSpan({
      text: "使用当前默认方案，支持撤销",
      cls: "cw-panel-format-description",
    });
    primary.addEventListener("click", () => {
      primary.disabled = true;
      void this.plugin.applySavedFormatting().finally(() => {
        if (primary.isConnected) primary.disabled = false;
      });
    });

    const actions = launcher.createDiv({ cls: "cw-panel-format-actions" });
    const undoButton = actions.createEl("button", {
      cls: "cw-panel-format-undo",
      attr: {
        type: "button",
        "aria-label": "撤回上一步编辑",
        title: "撤回上一步编辑",
      },
    });
    const undoIcon = undoButton.createSpan();
    setIcon(undoIcon, "undo-2");
    undoButton.addEventListener("click", () => this.plugin.undoCurrentEditorChange());

    const settingsButton = actions.createEl("button", {
      cls: "cw-panel-format-settings",
      attr: {
        type: "button",
        "aria-label": "设置一键排版方案",
        title: "设置一键排版方案",
      },
    });
    const settingsIcon = settingsButton.createSpan();
    setIcon(settingsIcon, "settings");
    settingsButton.addEventListener("click", () => this.plugin.openFormattingModal());
  }

  private addToolButton(
    container: HTMLElement,
    icon: string,
    label: string,
    description: string,
    active: boolean,
    onClick: () => void,
    disabled = false,
  ): void {
    const button = container.createEl("button", {
      cls: `cw-panel-tool${active ? " is-active" : ""}`,
      attr: { type: "button" },
    });
    button.disabled = disabled;
    const iconEl = button.createSpan({ cls: "cw-panel-tool-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ text: label, cls: "cw-panel-tool-label" });
    button.createSpan({ text: description, cls: "cw-panel-tool-description" });
    button.addEventListener("click", onClick);
  }

  private addSlider(
    container: HTMLElement,
    definition: SliderDefinition,
  ): void {
    const row = container.createDiv({ cls: "cw-panel-slider-row" });
    const label = row.createEl("label", { text: definition.label });
    const valueLabel = label.createEl("span", { cls: "cw-panel-slider-value" });
    const input = row.createEl("input", { type: "range" });
    input.min = `${definition.minimum}`;
    input.max = `${definition.maximum}`;
    input.step = `${definition.step}`;
    input.value = `${this.plugin.getCurrentLayoutSettings()[definition.key]}`;

    const showValue = (): void => {
      valueLabel.setText(`${input.value} ${definition.unit}`);
    };
    showValue();

    let transactionActive = false;
    const beginLayoutTransaction = (): void => {
      if (transactionActive) return;
      transactionActive = true;
      this.plugin.beginLayoutChange({
        mergeKey: `field:${definition.key}`,
        summary: { kind: "field", key: definition.key },
      });
    };
    const commitLayoutTransaction = (): void => {
      if (!transactionActive) return;
      transactionActive = false;
      const record = this.plugin.commitLayoutChange({
        mergeKey: `field:${definition.key}`,
        summary: { kind: "field", key: definition.key },
      });
      if (record) void this.plugin.commitSettings();
    };
    const cancelLayoutTransaction = (): void => {
      if (!transactionActive) return;
      transactionActive = false;
      void this.plugin.cancelLayoutChange().then(() => {
        input.value = `${this.plugin.getCurrentLayoutSettings()[definition.key]}`;
        showValue();
      });
    };

    input.addEventListener("pointerdown", beginLayoutTransaction);
    input.addEventListener("pointerup", commitLayoutTransaction);
    input.addEventListener("pointercancel", cancelLayoutTransaction);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelLayoutTransaction();
        return;
      }
      beginLayoutTransaction();
    });
    input.addEventListener("input", () => {
      beginLayoutTransaction();
      showValue();
      this.markLayoutPresetEdited();
      this.plugin.previewLayoutSettings({
        [definition.key]: Number(input.value),
      });
    });
    input.addEventListener("change", commitLayoutTransaction);
    input.addEventListener("keyup", commitLayoutTransaction);
    input.addEventListener("blur", commitLayoutTransaction);
  }

  private addToggle(
    container: HTMLElement,
    labelText: string,
    key: "justifyText" | "showDiagnostics" | "showStatusBar",
    rowClass = "",
  ): void {
    const row = container.createDiv({
      cls: `cw-panel-toggle-row${rowClass ? ` ${rowClass}` : ""}`,
    });
    const label = row.createEl("label");
    label.createSpan({ text: labelText });
    const input = label.createEl("input", { type: "checkbox" });
    input.checked = key === "justifyText"
      ? this.plugin.getCurrentLayoutSettings().justifyText
      : this.plugin.settings[key];
    input.addEventListener("change", () => {
      if (key === "justifyText") {
        void this.plugin.performLayoutChange(
          {
            mergeKey: "field:justifyText",
            summary: { kind: "field", key: "justifyText" },
          },
          () => {
            this.markLayoutPresetEdited();
            this.plugin.previewLayoutSettings({ justifyText: input.checked });
          },
        );
        return;
      }
      this.plugin.previewSettings({ [key]: input.checked });
      void this.plugin.commitSettings();
    });
  }

  private renderDiagnostics(
    container: HTMLElement,
    view: MarkdownView,
    diagnostics: TextDiagnostic[],
    isNovel: boolean,
  ): void {
    const section = container.createDiv({ cls: "cw-panel-section" });
    const heading = section.createDiv({ cls: "cw-panel-section-heading" });
    heading.createEl("h3", { text: "当前笔记提示" });
    heading.createSpan({ text: `${diagnostics.length}`, cls: "cw-panel-badge" });

    if (!isNovel) {
      section.createDiv({
        text: "当前笔记尚未启用写作模式；提示列表可查看，但正文中不会显示下划线。",
        cls: "cw-panel-help",
      });
    }

    if (diagnostics.length === 0) {
      section.createDiv({ text: "暂未发现问题。", cls: "cw-panel-success" });
      return;
    }

    const list = section.createDiv({ cls: "cw-panel-diagnostic-list" });
    for (const diagnostic of diagnostics.slice(0, 50)) {
      const position = view.editor.offsetToPos(diagnostic.from);
      const lineText = view.editor.getLine(position.line).trim();
      const item = list.createEl("button", { cls: "cw-panel-diagnostic" });
      const top = item.createDiv({ cls: "cw-panel-diagnostic-top" });
      top.createSpan({
        text: DIAGNOSTIC_LABELS[diagnostic.kind],
        cls: `cw-panel-diagnostic-kind cw-kind-${diagnostic.kind}`,
      });
      top.createSpan({
        text: `第 ${position.line + 1} 行`,
        cls: "cw-panel-diagnostic-line",
      });
      item.createDiv({ text: diagnostic.message, cls: "cw-panel-diagnostic-message" });
      item.createDiv({
        text: lineText || "（空行）",
        cls: "cw-panel-diagnostic-preview",
      });
      item.addEventListener("click", () => {
        void this.plugin.revealDiagnostic(diagnostic);
      });
    }

    if (diagnostics.length > 50) {
      section.createDiv({
        text: `仅显示前 50 条，其余 ${diagnostics.length - 50} 条请在正文中查看。`,
        cls: "cw-panel-help",
      });
    }
  }
}
