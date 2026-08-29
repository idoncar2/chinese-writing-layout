import { Modal } from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import { truncateExportPreview, type PreparedExportContent } from "./text-export";
import type { ExportScope } from "./types";

export class ExportPreviewModal extends Modal {
  constructor(
    private readonly plugin: ChineseWritingLayoutPlugin,
    private readonly prepared: PreparedExportContent,
    private readonly exportScope: ExportScope,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-export-preview-modal");
    this.setTitle("导出内容预览");

    const header = this.contentEl.createDiv({ cls: "cw-export-preview-header" });
    header.createSpan({
      cls: "cw-export-preview-scope",
      text: this.exportScope === "folder"
        ? `当前文件夹整稿 · ${this.prepared.sourceCount} 篇`
        : "当前笔记",
    });
    header.createSpan({
      cls: "cw-export-preview-mode",
      text: this.prepared.contentMode === "markdown" ? "Markdown" : "纯文本",
    });

    const preview = truncateExportPreview(this.prepared.text);
    const textarea = this.contentEl.createEl("textarea", {
      cls: "cw-export-preview-textarea",
      attr: {
        readonly: "true",
        "aria-label": "导出内容预览",
      },
    });
    textarea.value = preview.text;
    textarea.readOnly = true;
    textarea.spellcheck = false;

    if (preview.truncated) {
      this.contentEl.createDiv({
        cls: "cw-export-preview-notice",
        text: "内容较长，预览仅显示前 200,000 个字符；复制和导出仍包含全文。",
      });
    }

    const footer = this.contentEl.createDiv({ cls: "cw-export-preview-footer" });
    const backButton = footer.createEl("button", {
      text: "返回导出设置",
      attr: { type: "button" },
    });
    backButton.addEventListener("click", () => this.close());

    const copyButton = footer.createEl("button", {
      cls: "mod-cta",
      text: "复制全文",
      attr: { type: "button" },
    });
    copyButton.addEventListener("click", () => {
      void this.copyContent(copyButton);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async copyContent(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      await this.plugin.copyPreparedExportContent(this.prepared);
    } finally {
      button.disabled = false;
    }
  }
}
