import { Modal } from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import type { LongImagePlan } from "./image-export";
import {
  IMAGE_EXPORT_WIDTH_OPTIONS,
  type ExportScope,
  type ImageExportWidth,
} from "./types";

type LongImageExportProgress = (current: number, total: number) => void;

function getWidthLabel(width: ImageExportWidth): string {
  return IMAGE_EXPORT_WIDTH_OPTIONS.find((option) => option.value === width)?.label
    ?? `${width}px`;
}

export class LongImagePreviewModal extends Modal {
  constructor(
    private readonly plugin: ChineseWritingLayoutPlugin,
    private readonly plan: LongImagePlan,
    private readonly exportScope: ExportScope,
    private readonly onExport: (onProgress: LongImageExportProgress) => Promise<boolean>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-long-image-preview-modal");
    this.setTitle("长图分图预览");

    const summary = this.contentEl.createDiv({ cls: "cw-long-image-preview-summary" });
    summary.createSpan({
      cls: "cw-long-image-preview-scope",
      text: this.exportScope === "folder" ? "导出范围：当前文件夹整稿" : "导出范围：当前笔记",
    });
    summary.createSpan({
      cls: "cw-long-image-preview-resolution",
      text: `分辨率：${getWidthLabel(this.plan.width)}`,
    });
    this.contentEl.createDiv({
      cls: "cw-long-image-preview-count",
      text: `预计生成：${this.plan.segments.length} 张长图`,
    });

    const list = this.contentEl.createDiv({ cls: "cw-long-image-preview-list" });
    for (const segment of this.plan.segments) {
      const card = list.createDiv({ cls: "cw-long-image-preview-segment" });
      const heading = card.createDiv({ cls: "cw-long-image-preview-segment-heading" });
      heading.createEl("strong", { text: `第 ${segment.index} 张` });
      heading.createSpan({ text: `${segment.width} × ${segment.height}` });
      card.createDiv({
        cls: "cw-long-image-preview-segment-range",
        text: `${segment.startLabel} → ${segment.endLabel}`,
      });
      card.createDiv({
        cls: "cw-long-image-preview-segment-first-sentence",
        text: `第一句话：${segment.firstSentence}`,
      });
      if (segment.splitInsideParagraph) {
        card.createDiv({
          cls: "cw-long-image-preview-segment-note",
          text: `第 ${segment.index} 张包含一次超长段落切分`,
        });
      }
    }

    for (const warning of this.plan.warnings) {
      this.contentEl.createDiv({
        cls: "cw-long-image-preview-warning",
        text: warning.message,
      });
    }

    const footer = this.contentEl.createDiv({ cls: "cw-long-image-preview-footer" });
    const backButton = footer.createEl("button", {
      text: "返回",
      attr: { type: "button" },
    });
    backButton.addEventListener("click", () => this.close());

    const exportButton = footer.createEl("button", {
      cls: "mod-cta",
      text: "开始导出",
      attr: { type: "button" },
    });
    exportButton.addEventListener("click", () => {
      void this.startExport(exportButton);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async startExport(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const succeeded = await this.onExport((current, total) => {
        button.setText(`正在生成 ${current} / ${total}`);
      });
      if (succeeded) {
        this.close();
      } else {
        button.disabled = false;
        button.setText("开始导出");
      }
    } catch (error) {
      console.error("中文写作排版：长图导出失败", error);
      button.disabled = false;
      button.setText("开始导出");
    }
  }
}
