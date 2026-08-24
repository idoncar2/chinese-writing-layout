import { Modal, Setting, setIcon } from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import type { ExportFormat, ExportScope } from "./types";

export class ExportModal extends Modal {
  private format: ExportFormat;
  private exportScope: ExportScope;
  private includeFileTitles: boolean;
  private stripMarkdown: boolean;
  private openFolderAfterExport: boolean;
  private wordTitlePage: boolean;
  private wordPageNumbers: boolean;
  private wordHeader: boolean;
  private advancedEl?: HTMLElement;

  constructor(private plugin: ChineseWritingLayoutPlugin) {
    super(plugin.app);
    this.format = plugin.settings.preferredExportFormat;
    this.exportScope = plugin.settings.preferredExportScope;
    this.includeFileTitles = plugin.settings.includeFileTitles;
    this.stripMarkdown = plugin.settings.stripMarkdownOnExport;
    this.openFolderAfterExport = plugin.settings.openFolderAfterExport;
    this.wordTitlePage = plugin.settings.wordTitlePage;
    this.wordPageNumbers = plugin.settings.wordPageNumbers;
    this.wordHeader = plugin.settings.wordHeader;
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
        .onChange((value) => { this.exportScope = value as ExportScope; }));

    new Setting(this.contentEl)
      .setName("文件格式")
      .setDesc("PNG 会自动分页，避免长文图片超过系统限制。")
      .addDropdown((dropdown) => dropdown
        .addOption("txt", "纯文本（.txt）")
        .addOption("docx", "Word 文档（.docx）")
        .addOption("png", "分页图片（.png）")
        .setValue(this.format)
        .onChange((value) => {
          this.format = value as ExportFormat;
          this.renderAdvancedOptions();
        }));

    new Setting(this.contentEl)
      .setName("加入文件标题")
      .setDesc("整稿导出时，用每个文件名分隔不同文章。")
      .addToggle((toggle) => toggle
        .setValue(this.includeFileTitles)
        .onChange((value) => { this.includeFileTitles = value; }));

    new Setting(this.contentEl)
      .setName("移除 Markdown 语法")
      .setDesc("一键去除标题符号、粗体、链接、双链、列表等标记；关闭后保留 Markdown 原文。")
      .addToggle((toggle) => toggle
        .setValue(this.stripMarkdown)
        .onChange((value) => { this.stripMarkdown = value; }));

    this.advancedEl = this.contentEl.createDiv({ cls: "cw-export-advanced" });
    this.renderAdvancedOptions();

    new Setting(this.contentEl)
      .setName("导出后打开文件夹")
      .setDesc("Windows 桌面端打开并尝试置前系统文件管理器；移动端定位到 Obsidian 文件列表。")
      .addToggle((toggle) => toggle
        .setValue(this.openFolderAfterExport)
        .onChange((value) => { this.openFolderAfterExport = value; }));

    const location = this.contentEl.createDiv({ cls: "cw-export-location" });
    location.createSpan({ text: "保存位置" });
    location.createEl("code", { text: "写作导出/" });

    const footer = this.contentEl.createDiv({ cls: "cw-export-footer" });
    const openButton = footer.createEl("button", { text: "打开导出文件夹" });
    openButton.addEventListener("click", () => void this.plugin.openExportFolder());
    const cancelButton = footer.createEl("button", { text: "取消" });
    cancelButton.addEventListener("click", () => this.close());
    const exportButton = footer.createEl("button", { text: "开始导出", cls: "mod-cta" });
    exportButton.addEventListener("click", () => {
      exportButton.disabled = true;
      void this.plugin.exportNotes({
        format: this.format,
        scope: this.exportScope,
        includeFileTitles: this.includeFileTitles,
        stripMarkdown: this.stripMarkdown,
        openFolderAfterExport: this.openFolderAfterExport,
        wordTitlePage: this.wordTitlePage,
        wordPageNumbers: this.wordPageNumbers,
        wordHeader: this.wordHeader,
      }).then((succeeded) => {
        if (succeeded) this.close();
        else exportButton.disabled = false;
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
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
