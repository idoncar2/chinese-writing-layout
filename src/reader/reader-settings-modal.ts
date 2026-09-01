import { App, Modal, Setting } from "obsidian";
import {
  FontPickerModal,
  getFontSelectionDisplayName,
  getFontSelectionPreviewFamily,
  type FontPickerUserFontActions,
} from "../font-options";
import {
  READER_BACKGROUND_OPTIONS,
  normalizeReaderSettings,
} from "./reader-constants";
import type { ReaderSettings, UserFont } from "../types";

export interface ReaderSettingsHost {
  app: App;
  getReaderSettings(): ReaderSettings;
  getReaderUserFonts(): readonly UserFont[];
  getFontPickerUserFontActions(): FontPickerUserFontActions;
  previewReaderSettings(patch: Partial<ReaderSettings>): void;
  commitReaderSettings(): Promise<void>;
}

export class ReaderSettingsModal extends Modal {
  private settings: ReaderSettings;

  constructor(
    app: App,
    private readonly host: ReaderSettingsHost,
  ) {
    super(app);
    this.settings = normalizeReaderSettings(host.getReaderSettings());
  }

  onOpen(): void {
    this.modalEl.addClass("cw-reader-settings-modal");
    this.setTitle("阅读设置");
    this.contentEl.createEl("p", {
      text: "阅读设置只影响读者视角，不会改变写作版式。调整后立即应用。",
      cls: "cw-reader-modal-intro",
    });
    this.renderFontSetting();
    this.renderSliderSetting(
      "字号",
      "阅读正文的基础字号。",
      "fontSize",
      14,
      30,
      1,
    );
    this.renderSliderSetting(
      "行距",
      "正文行距倍数。",
      "lineHeight",
      1.4,
      2.6,
      0.1,
    );
    this.renderSliderSetting(
      "段距",
      "相邻段落之间的距离。",
      "paragraphSpacing",
      0,
      2,
      0.1,
    );
    this.renderSliderSetting(
      "正文宽度",
      "桌面阅读正文区域的最大宽度。",
      "contentWidth",
      520,
      960,
      1,
    );
    this.renderSliderSetting(
      "页面边距",
      "阅读区域两侧的留白。",
      "pagePadding",
      16,
      80,
      1,
    );
    new Setting(this.contentEl)
      .setName("阅读背景")
      .setDesc("独立于当前 Obsidian 主题的阅读背景。")
      .addDropdown((dropdown) => {
        for (const option of READER_BACKGROUND_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown.setValue(this.settings.background);
        dropdown.onChange((value) => {
          if (!READER_BACKGROUND_OPTIONS.some((option) => option.value === value)) return;
          this.updateSettings({ background: value as ReaderSettings["background"] });
        });
      });
  }

  private renderFontSetting(): void {
    const setting = new Setting(this.contentEl)
      .setClass("cw-reader-font-setting")
      .setName("阅读字体")
      .setDesc("标题默认跟随阅读字体。");
    let buttonEl: HTMLButtonElement | undefined;
    setting.addButton((component) => {
      buttonEl = component.buttonEl;
      return component
        .setButtonText(this.getFontLabel())
        .setTooltip("选择阅读字体")
        .onClick(() => {
          new FontPickerModal(
            this.host.app,
            "阅读",
            this.settings.font,
            this.host.getReaderUserFonts(),
            (selection) => {
              this.settings.font = selection;
              this.host.previewReaderSettings({ font: selection });
              void this.host.commitReaderSettings();
              component.setButtonText(this.getFontLabel());
            },
            this.host.getFontPickerUserFontActions(),
          ).open();
        });
    });
    buttonEl?.classList.add("cw-reader-font-button");
    if (buttonEl) {
      buttonEl.setCssStyles({
        fontFamily: getFontSelectionPreviewFamily(
          this.settings.font,
          this.host.getReaderUserFonts(),
        ),
      });
    }
  }

  private renderSliderSetting(
    name: string,
    description: string,
    key: "fontSize" | "lineHeight" | "paragraphSpacing" | "contentWidth" | "pagePadding",
    minimum: number,
    maximum: number,
    step: number,
  ): void {
    new Setting(this.contentEl)
      .setName(name)
      .setDesc(description)
      .addSlider((slider) => {
        slider
          .setLimits(minimum, maximum, step)
          .setInstant(true)
          .setValue(this.settings[key])
          .onChange((value) => this.updateSettings({ [key]: value }));
      });
  }

  private updateSettings(patch: Partial<ReaderSettings>): void {
    this.settings = normalizeReaderSettings({ ...this.settings, ...patch });
    this.host.previewReaderSettings(patch);
    void this.host.commitReaderSettings();
  }

  private getFontLabel(): string {
    return getFontSelectionDisplayName(
      this.settings.font,
      this.host.getReaderUserFonts(),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
