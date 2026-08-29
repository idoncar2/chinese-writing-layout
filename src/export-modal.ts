import { Modal, Notice, Platform, Setting, setIcon, type ToggleComponent } from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import { ExportPreviewModal } from "./export-preview-modal";
import { LongImagePreviewModal } from "./long-image-preview-modal";
import type {
  ExportContentOptions,
  PreparedExportContent,
} from "./text-export";
import {
  IMAGE_EXPORT_WIDTH_OPTIONS,
  type ExportFormat,
  type ExportScope,
  type ImageExportWidth,
  normalizeImageExportWidth,
} from "./types";
import type { LongImagePlan } from "./image-export";

export class ExportModal extends Modal {
  private format: ExportFormat;
  private exportScope: ExportScope;
  private includeFileTitles: boolean;
  private stripMarkdown: boolean;
  private openFolderAfterExport: boolean;
  private wordTitlePage: boolean;
  private wordPageNumbers: boolean;
  private wordHeader: boolean;
  private imageExportWidth: ImageExportWidth;
  private longImageOptionsEl?: HTMLElement;
  private longImagePlan?: LongImagePlan;
  private longImagePrepared?: PreparedExportContent;
  private advancedEl?: HTMLElement;
  private stripSetting?: Setting;
  private stripToggle?: ToggleComponent;

  constructor(private plugin: ChineseWritingLayoutPlugin) {
    super(plugin.app);
    this.format = plugin.settings.preferredExportFormat;
    this.exportScope = plugin.settings.preferredExportScope;
    this.includeFileTitles = plugin.settings.includeFileTitles;
    this.stripMarkdown = plugin.settings.stripMarkdownOnExport;
    this.openFolderAfterExport = Platform.isMobileApp
      ? false
      : plugin.settings.openFolderAfterExport;
    this.wordTitlePage = plugin.settings.wordTitlePage;
    this.wordPageNumbers = plugin.settings.wordPageNumbers;
    this.wordHeader = plugin.settings.wordHeader;
    this.imageExportWidth = normalizeImageExportWidth(plugin.settings.imageExportWidth);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-export-modal");
    this.setTitle("导出作品");

    const intro = this.contentEl.createDiv({ cls: "cw-export-intro" });
    const icon = intro.createSpan({ cls: "cw-export-intro-icon" });
    setIcon(icon, "file-down");
    intro.createDiv({
      text: "导出会生成新文件，不会修改原笔记。",
      cls: "cw-export-intro-text",
    });

    new Setting(this.contentEl)
      .setName("导出范围")
      .setDesc("整稿会合并当前笔记所在文件夹中的 Markdown，并按文件名自然排序。")
      .addDropdown((dropdown) => dropdown
        .addOption("current", "当前笔记")
        .addOption("folder", "当前文件夹整稿")
        .setValue(this.exportScope)
        .onChange((value) => {
          this.exportScope = value as ExportScope;
          this.invalidateLongImagePlan();
        }));

    new Setting(this.contentEl)
      .setName("文件格式")
      .setDesc("Markdown 保留原始语法；长图会按安全高度自动分图。")
      .addDropdown((dropdown) => dropdown
        .addOption("txt", "纯文本（.txt）")
        .addOption("md", "Markdown（.md）")
        .addOption("docx", "Word 文档（.docx）")
        .addOption("png", "长图（.png）")
        .setValue(this.format)
        .onChange((value) => {
          this.format = value as ExportFormat;
          this.invalidateLongImagePlan();
          this.updateStripMarkdownControl();
          this.renderAdvancedOptions();
          this.renderLongImageOptions();
        }));

    this.longImageOptionsEl = this.contentEl.createDiv({ cls: "cw-export-long-image-options" });
    this.renderLongImageOptions();

    new Setting(this.contentEl)
      .setName("加入文件标题")
      .setDesc("整稿导出时，用每个文件名分隔不同文章。")
      .addToggle((toggle) => toggle
        .setValue(this.includeFileTitles)
        .onChange((value) => {
          this.includeFileTitles = value;
          this.invalidateLongImagePlan();
        }));

    const stripSetting = new Setting(this.contentEl)
      .setName("移除 Markdown 语法")
      .setDesc("")
      .addToggle((toggle) => {
        this.stripToggle = toggle;
        toggle
          .setValue(this.stripMarkdown)
          .onChange((value) => {
            this.stripMarkdown = value;
            this.invalidateLongImagePlan();
          });
      });
    this.stripSetting = stripSetting;
    this.updateStripMarkdownControl();

    this.advancedEl = this.contentEl.createDiv({ cls: "cw-export-advanced" });
    this.renderAdvancedOptions();

    new Setting(this.contentEl)
      .setName("导出后打开文件夹")
      .setDesc(Platform.isMobileApp
        ? "移动端不可用；文件仍可导出到固定的“写作导出/”目录。"
        : "导出完成后打开刚才选择的本地文件夹。")
      .addToggle((toggle) => toggle
        .setDisabled(Platform.isMobileApp)
        .setValue(this.openFolderAfterExport)
        .onChange((value) => { this.openFolderAfterExport = value; }));

    this.renderLocations();
    this.renderFooter();
  }

  onClose(): void {
    this.contentEl.empty();
    this.longImagePlan = undefined;
    this.longImagePrepared = undefined;
  }

  private updateStripMarkdownControl(): void {
    const isMarkdown = this.format === "md";
    this.stripToggle?.setDisabled(isMarkdown);
    this.stripSetting?.setDesc(isMarkdown
      ? "Markdown 导出会保留原始 Markdown 语法。"
      : "一键去除标题符号、粗体、链接、双链、列表等标记；关闭后保留 Markdown 原文。");
  }

  private invalidateLongImagePlan(): void {
    this.longImagePlan = undefined;
    this.longImagePrepared = undefined;
  }

  private renderLongImageOptions(): void {
    if (!this.longImageOptionsEl) return;
    this.longImageOptionsEl.empty();
    if (this.format !== "png") return;

    this.longImageOptionsEl.createEl("h3", { text: "长图设置" });
    const selected = IMAGE_EXPORT_WIDTH_OPTIONS.find((option) => option.value === this.imageExportWidth)
      ?? IMAGE_EXPORT_WIDTH_OPTIONS[1];
    const resolutionSetting = new Setting(this.longImageOptionsEl)
      .setName("图片分辨率")
      .setDesc(selected.description)
      .addDropdown((dropdown) => {
        for (const option of IMAGE_EXPORT_WIDTH_OPTIONS) {
          dropdown.addOption(String(option.value), option.label);
        }
        dropdown
          .setValue(String(this.imageExportWidth))
          .onChange((value) => {
            this.imageExportWidth = Number(value) as ImageExportWidth;
            this.invalidateLongImagePlan();
            const next = IMAGE_EXPORT_WIDTH_OPTIONS.find((option) => option.value === this.imageExportWidth);
            if (next) resolutionSetting.setDesc(next.description);
          });
      });
    this.longImageOptionsEl.createDiv({
      cls: "cw-export-long-image-note",
      text: Platform.isMobileApp
        ? "按稳定的手机阅读宽度排版；分辨率只提升清晰度，不会把一行文字拉成电脑宽屏。"
        : "超清图片可能被拆分为更多张。",
    });
    const previewButton = this.longImageOptionsEl.createEl("button", {
      cls: "cw-export-long-image-preview",
      text: "预览分图",
      attr: {
        type: "button",
        "aria-label": "预览长图分图",
        title: "只测量分图，不生成图片",
      },
    });
    previewButton.addEventListener("click", () => {
      void this.previewLongImages(previewButton);
    });
  }

  private renderLocations(): void {
    const locations = this.contentEl.createDiv({ cls: "cw-export-locations" });

    const currentFile = this.plugin.getWritingMarkdownView()?.file;
    const currentLocation = locations.createDiv({ cls: "cw-export-location" });
    const currentCopy = currentLocation.createDiv({ cls: "cw-export-location-copy" });
    currentCopy.createSpan({ text: "当前文件", cls: "cw-export-location-label" });
    currentCopy.createEl("code", {
      text: currentFile?.path ?? "未识别当前 Markdown 文件",
    });
    const currentButton = currentLocation.createEl("button", {
      text: Platform.isMobileApp ? "移动端不可用" : "打开所在文件夹",
      attr: {
        type: "button",
        "aria-label": "打开当前文件所在文件夹",
        title: "打开当前文件所在文件夹",
      },
    });
    currentButton.disabled = !currentFile || Platform.isMobileApp;
    currentButton.addEventListener("click", () => void this.plugin.openCurrentNoteFolder());
  }

  private renderFooter(): void {
    const footer = this.contentEl.createDiv({ cls: "cw-export-footer" });
    const cancelButton = footer.createEl("button", {
      text: "取消",
      attr: { type: "button" },
    });
    cancelButton.addEventListener("click", () => this.close());

    const previewButton = footer.createEl("button", {
      text: "预览内容",
      attr: { type: "button" },
    });
    previewButton.addEventListener("click", () => {
      void this.previewContent(previewButton);
    });

    const copyButton = footer.createEl("button", {
      text: "复制全文",
      attr: { type: "button" },
    });
    copyButton.addEventListener("click", () => {
      void this.copyContent(copyButton);
    });

    const exportButton = footer.createEl("button", {
      text: "开始导出",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    exportButton.addEventListener("click", () => {
      void this.exportContent(exportButton);
    });
  }

  private getContentOptions(): ExportContentOptions {
    return {
      format: this.format,
      scope: this.exportScope,
      includeFileTitles: this.includeFileTitles,
      stripMarkdown: this.stripMarkdown,
    };
  }

  private async prepareContentOrNotify(): Promise<PreparedExportContent | null> {
    try {
      const prepared = await this.plugin.prepareExportContent(this.getContentOptions());
      if (!prepared?.text) {
        new Notice("所选范围没有可用的导出正文");
        return null;
      }
      return prepared;
    } catch (error) {
      console.error("中文写作排版：准备导出内容失败", error);
      new Notice("准备导出内容失败，请重试");
      return null;
    }
  }

  private async previewContent(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const prepared = await this.prepareContentOrNotify();
      if (prepared) {
        new ExportPreviewModal(this.plugin, prepared, this.exportScope).open();
      }
    } finally {
      button.disabled = false;
    }
  }

  private async copyContent(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const prepared = await this.prepareContentOrNotify();
      if (prepared) await this.plugin.copyPreparedExportContent(prepared);
    } finally {
      button.disabled = false;
    }
  }

  private async prepareLongImageOrNotify(): Promise<{
    prepared: PreparedExportContent;
    plan: LongImagePlan;
  } | null> {
    try {
      const prepared = await this.plugin.prepareLongImagePlan(
        this.getContentOptions(),
        this.imageExportWidth,
      );
      if (!prepared) {
        new Notice("所选范围没有可用的长图正文");
        return null;
      }
      return prepared;
    } catch (error) {
      console.error("中文写作排版：预检长图失败", error);
      new Notice("长图分图预检失败，请降低分辨率后重试");
      return null;
    }
  }

  private async previewLongImages(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const result = await this.prepareLongImageOrNotify();
      if (!result) return;
      this.longImagePrepared = result.prepared;
      this.longImagePlan = result.plan;
      new LongImagePreviewModal(
        this.plugin,
        result.plan,
        this.exportScope,
        (onProgress) => this.exportPreparedLongImage(result, onProgress),
      ).open();
    } finally {
      button.disabled = false;
    }
  }

  private async exportPreparedLongImage(
    result: { prepared: PreparedExportContent; plan: LongImagePlan },
    onProgress: (current: number, total: number) => void,
  ): Promise<boolean> {
    const succeeded = await this.plugin.exportNotes({
      ...this.getContentOptions(),
      openFolderAfterExport: this.openFolderAfterExport,
      wordTitlePage: this.wordTitlePage,
      wordPageNumbers: this.wordPageNumbers,
      wordHeader: this.wordHeader,
      imageExportWidth: this.imageExportWidth,
      preparedContent: result.prepared,
      longImagePlan: result.plan,
      onProgress,
    });
    if (succeeded) this.close();
    return succeeded;
  }

  private async exportContent(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const succeeded = await this.plugin.exportNotes({
        ...this.getContentOptions(),
        openFolderAfterExport: this.openFolderAfterExport,
        wordTitlePage: this.wordTitlePage,
        wordPageNumbers: this.wordPageNumbers,
        wordHeader: this.wordHeader,
        imageExportWidth: this.imageExportWidth,
        preparedContent: this.format === "png" ? this.longImagePrepared : undefined,
        longImagePlan: this.format === "png" ? this.longImagePlan : undefined,
        onProgress: (current, total) => {
          button.setText(`正在生成 ${current} / ${total}`);
        },
      });
      if (succeeded) this.close();
      else {
        button.disabled = false;
        button.setText("开始导出");
      }
    } catch (error) {
      console.error("中文写作排版：导出操作失败", error);
      new Notice("导出失败，请重试");
      button.disabled = false;
      button.setText("开始导出");
    }
  }

  private renderAdvancedOptions(): void {
    if (!this.advancedEl) return;
    this.advancedEl.empty();
    if (this.format !== "docx") return;
    this.advancedEl.createEl("h3", { text: "Word 排版" });
    new Setting(this.advancedEl)
      .setName("标题页")
      .setDesc("在正文前生成独立标题页。")
      .addToggle((toggle) => toggle.setValue(this.wordTitlePage).onChange((value) => {
        this.wordTitlePage = value;
      }));
    new Setting(this.advancedEl)
      .setName("页眉")
      .setDesc("在页眉显示导出作品名称。")
      .addToggle((toggle) => toggle.setValue(this.wordHeader).onChange((value) => {
        this.wordHeader = value;
      }));
    new Setting(this.advancedEl)
      .setName("页码")
      .setDesc("在页脚中央显示页码。")
      .addToggle((toggle) => toggle.setValue(this.wordPageNumbers).onChange((value) => {
        this.wordPageNumbers = value;
      }));
  }
}
