import { App, Modal, Setting } from "obsidian";
import { type ReaderMode } from "../types";

export interface ReaderModeHost {
  openReader(mode: ReaderMode): Promise<void>;
}

export class ReaderModeModal extends Modal {
  constructor(
    app: App,
    private readonly host: ReaderModeHost,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-reader-mode-modal");
    this.setTitle("选择阅读方式");
    this.contentEl.createEl("p", {
      text: "选择一种读者视角，原 Markdown 编辑页会保持打开。",
      cls: "cw-reader-modal-intro",
    });

    this.addMode("desktop", "桌面阅读", "连续滚动，适合长文阅读");
    this.addMode("phone", "手机预览", "桌面端模拟手机分页效果");
  }

  private addMode(mode: ReaderMode, title: string, description: string): void {
    new Setting(this.contentEl)
      .setClass("cw-reader-mode-option")
      .setName(title)
      .setDesc(description)
      .addButton((button) => button
        .setButtonText("打开")
        .onClick(() => {
          this.close();
          void this.host.openReader(mode);
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
