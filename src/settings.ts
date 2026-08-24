import { App, PluginSettingTab, Setting } from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import { FontPickerModal } from "./font-options";
import { getFontStackSummary } from "./system-fonts";
import {
  DEFAULT_SETTINGS,
  PAPER_THEME_OPTIONS,
  TYPEWRITER_CURSOR_POSITIONS,
  type CssClassLayoutRule,
  type InterfaceAccentMode,
  type InterfaceMode,
  type PaperTheme,
} from "./types";

type FontSettingKey =
  | "fontFamily"
  | "headingFontFamily"
  | "quoteFontFamily"
  | "boldFontFamily"
  | "italicFontFamily";

export class ChineseWritingSettingTab extends PluginSettingTab {
  plugin: ChineseWritingLayoutPlugin;

  constructor(app: App, plugin: ChineseWritingLayoutPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "中文写作排版" });
    containerEl.createEl("p", {
      text: "“写作模式”只为当前笔记开启写作显示，字号、行距与缩进通过右侧“版式微调”调整；“一键排版”才会按所选规则整理 Markdown 原文，并可立即撤销。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("界面模式")
      .setDesc("简洁版仅保留左侧一键写作模式；专业版使用右侧写作工坊。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("simple", "简洁版")
          .addOption("professional", "专业版（右侧写作工坊）")
          .setValue(this.plugin.settings.interfaceMode)
          .onChange(async (value) => {
            await this.plugin.setInterfaceMode(value as InterfaceMode);
          }),
      );

    new Setting(containerEl)
      .setName("界面重点色")
      .setDesc("跟随系统皮肤时使用 Obsidian 当前主题的重点色；也可以改为自定义颜色。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("theme", "跟随系统皮肤")
          .addOption("custom", "自定义")
          .setValue(this.plugin.settings.interfaceAccentMode)
          .onChange(async (value) => {
            this.plugin.settings.interfaceAccentMode = value as InterfaceAccentMode;
            await this.plugin.saveAndApplySettings();
            this.display();
          }),
      );

    if (this.plugin.settings.interfaceAccentMode === "custom") {
      new Setting(containerEl)
        .setName("自定义重点色")
        .setDesc("用于右侧写作工坊的按钮、图标、焦点与选中状态。")
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.interfaceAccentColor)
            .onChange(async (value) => {
              this.plugin.settings.interfaceAccentColor = value;
              await this.plugin.saveAndApplySettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("启用类名")
      .setDesc("带有这个 cssclasses 值的笔记将进入写作模式。")
      .addText((text) =>
        text
          .setPlaceholder("chinese-novel")
          .setValue(this.plugin.settings.activationClass)
          .onChange(async (value) => {
            const normalized = value.trim().replace(/^\.+/, "");
            this.plugin.settings.activationClass =
              normalized || DEFAULT_SETTINGS.activationClass;
            await this.plugin.saveAndApplySettings();
          }),
      );

    this.renderCssClassLayoutRules(containerEl);

    containerEl.createEl("h3", { text: "正文排版" });
    containerEl.createDiv({
      text: "这里设置全局默认版式。需要某篇笔记单独排版时，请在右侧写作工坊开启“此笔记使用独立版式”。",
      cls: "setting-item-description cw-settings-layout-scope-help",
    });

    this.addFontPickerSetting(containerEl, "正文字体", "fontFamily", "用于普通正文段落。");
    this.addFontPickerSetting(containerEl, "标题字体", "headingFontFamily", "用于笔记标题和 Markdown 标题。");
    const fontGuide = containerEl.createEl("details", { cls: "cw-settings-font-guide" });
    fontGuide.createEl("summary", { text: "更多字体设置" });
    this.addFontPickerSetting(fontGuide, "引用字体", "quoteFontFamily", "用于 > 引用段落。");
    this.addFontPickerSetting(fontGuide, "粗体字体", "boldFontFamily", "用于 **粗体** 内容。");
    this.addFontPickerSetting(fontGuide, "斜体字体", "italicFontFamily", "用于 *斜体* 内容。");
    fontGuide.createEl("p", {
      text: "以上三项就是特殊格式字体，可以分别设置。字体选择器会自动筛查 Windows 系统与当前用户安装的字体；安装与备用列表说明位于选择器底部。",
    });

    this.addSliderSetting(
      containerEl,
      "正文字号",
      "像素",
      14,
      28,
      1,
      () => this.plugin.getGlobalLayoutSettings().fontSize,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ fontSize: value });
        await this.plugin.saveAndApplySettings();
      },
    );

    this.addSliderSetting(
      containerEl,
      "行距",
      "倍",
      1.4,
      2.6,
      0.1,
      () => this.plugin.getGlobalLayoutSettings().lineHeight,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ lineHeight: value });
        await this.plugin.saveAndApplySettings();
      },
    );

    this.addSliderSetting(
      containerEl,
      "段间距",
      "em",
      0,
      2,
      0.1,
      () => this.plugin.getGlobalLayoutSettings().paragraphSpacing,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ paragraphSpacing: value });
        await this.plugin.saveAndApplySettings();
      },
    );

    this.addSliderSetting(
      containerEl,
      "首行缩进",
      "字符",
      0,
      4,
      0.5,
      () => this.plugin.getGlobalLayoutSettings().firstLineIndent,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ firstLineIndent: value });
        await this.plugin.saveAndApplySettings();
      },
    );

    this.addSliderSetting(
      containerEl,
      "正文宽度",
      "汉字宽",
      28,
      72,
      1,
      () => this.plugin.getGlobalLayoutSettings().contentWidth,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ contentWidth: value });
        await this.plugin.saveAndApplySettings();
      },
    );

    new Setting(containerEl)
      .setName("两端对齐")
      .setDesc("让段落左右边缘尽量整齐。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.getGlobalLayoutSettings().justifyText)
          .onChange(async (value) => {
            this.plugin.markGlobalLayoutPresetEdited();
            this.plugin.previewGlobalLayoutSettings({ justifyText: value });
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(containerEl)
      .setName("纸张主题")
      .setDesc("仅影响写作模式笔记的正文区域。")
      .addDropdown((dropdown) => {
        for (const option of PAPER_THEME_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        return dropdown
          .setValue(this.plugin.getGlobalLayoutSettings().paperTheme)
          .onChange(async (value) => {
            this.plugin.markGlobalLayoutPresetEdited();
            this.plugin.previewGlobalLayoutSettings({ paperTheme: value as PaperTheme });
            await this.plugin.saveAndApplySettings();
          });
      });

    new Setting(containerEl)
      .setName("自定义纸张图片")
      .setDesc("从当前 Obsidian 库中的图片选择；选择后会自动启用“自定义图片”主题。")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "不使用图片");
        for (const file of this.plugin.getAvailablePaperImages()) {
          dropdown.addOption(file.path, file.path);
        }
        return dropdown
          .setValue(this.plugin.getGlobalLayoutSettings().customPaperImage)
          .onChange(async (value) => {
            this.plugin.markGlobalLayoutPresetEdited();
            this.plugin.previewGlobalLayoutSettings({
              customPaperImage: value,
              ...(value ? { paperTheme: "custom" } : {}),
            });
            await this.plugin.saveAndApplySettings();
            this.display();
          });
      });

    containerEl.createEl("h3", { text: "写作辅助" });

    new Setting(containerEl)
      .setName("打字机模式")
      .setDesc("写作时让当前输入行保持在设定的编辑器位置。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.typewriterMode)
          .onChange(async (value) => {
            this.plugin.settings.typewriterMode = value;
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(containerEl)
      .setName("打字机光标位置")
      .setDesc("30% 靠上，50% 居中，70% 靠下。")
      .addDropdown((dropdown) => {
        for (const position of TYPEWRITER_CURSOR_POSITIONS) {
          dropdown.addOption(`${position}`, `${position}%`);
        }
        return dropdown
          .setValue(`${this.plugin.settings.typewriterCursorPosition}`)
          .onChange(async (value) => {
            this.plugin.settings.typewriterCursorPosition = Number(value);
            await this.plugin.saveAndApplySettings();
          });
      });

    new Setting(containerEl)
      .setName("高亮当前行")
      .setDesc("使用柔和背景标出光标所在行，不修改正文。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlightCurrentLine)
          .onChange(async (value) => {
            this.plugin.settings.highlightCurrentLine = value;
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(containerEl)
      .setName("中文标点提示")
      .setDesc("用下划线提示半角标点、成对符号、重复标点和手工段首空格。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDiagnostics)
          .onChange(async (value) => {
            this.plugin.settings.showDiagnostics = value;
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(containerEl)
      .setName("状态栏统计")
      .setDesc("显示当前写作模式笔记的正文字符数和提示数量。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showStatusBar = value;
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(containerEl)
      .setName("恢复全部插件设置")
      .setDesc("恢复版式、写作辅助、排版方案和界面模式，并删除自定义模板。")
      .addButton((button) =>
        button.setButtonText("恢复默认").onClick(async () => {
          await this.plugin.resetSettings();
          this.display();
        }),
      );
  }

  private renderCssClassLayoutRules(container: HTMLElement): void {
    container.createEl("h3", { text: "按 CSS Classes 自动套用版式" });
    container.createDiv({
      text: "笔记进入写作模式后，会按从上到下的顺序匹配 cssclasses，并自动采用对应模板；单篇独立版式的优先级更高。",
      cls: "setting-item-description cw-settings-css-rule-intro",
    });

    let templateName = "";
    let saveTemplateButton: HTMLButtonElement | undefined;
    new Setting(container)
      .setName("保存当前版式为模板")
      .setDesc(
        this.plugin.settings.customLayoutPresets.length > 0
          ? `已保存 ${this.plugin.settings.customLayoutPresets.length} 个自定义模板；保存后可在下方规则中直接选择。`
          : "先将当前版式保存并命名，保存后即可在下方规则中选择。",
      )
      .addText((text) => text
        .setPlaceholder("例如：小说正文")
        .onChange((value) => {
          templateName = value.trim();
          if (saveTemplateButton) saveTemplateButton.disabled = templateName.length === 0;
        }))
      .addButton((button) => {
        saveTemplateButton = button.buttonEl;
        return button
          .setButtonText("保存模板")
          .setDisabled(true)
          .onClick(async () => {
            if (!templateName) return;
            await this.plugin.saveCustomLayoutPreset(templateName);
            this.display();
          });
      });

    const list = container.createDiv({ cls: "cw-settings-css-rules" });
    if (this.plugin.settings.cssClassLayoutRules.length === 0) {
      list.createDiv({
        text: "暂未设置自动版式规则。请先在写作工坊保存需要复用的版式模板。",
        cls: "setting-item-description cw-settings-css-rule-empty",
      });
    }

    this.plugin.settings.cssClassLayoutRules.forEach((rule, index) => {
      const setting = new Setting(list)
        .setName(`规则 ${index + 1}`)
        .setDesc(index === 0 ? "最先匹配" : `优先级 ${index + 1}`)
        .setClass("cw-settings-css-rule");
      setting.addText((text) => {
        text
          .setPlaceholder("例如：scene-romance")
          .setValue(rule.cssClass)
          .onChange(async (value) => {
            rule.cssClass = value.trim().replace(/^\.+/, "").split(/\s+/u)[0] ?? "";
            await this.plugin.saveAndApplySettings();
          });
        text.inputEl.setAttr("aria-label", `规则 ${index + 1} 的 CSS class`);
      });
      setting.addDropdown((dropdown) => {
        dropdown.addOption("obsidian", "跟随 Obsidian");
        dropdown.addOption("default", "推荐写作版式");
        for (const preset of this.plugin.settings.customLayoutPresets) {
          dropdown.addOption(`saved:${preset.id}`, `自定义｜${preset.name}`);
        }
        return dropdown
          .setValue(rule.layoutPreset)
          .onChange(async (value) => {
            rule.layoutPreset = value as CssClassLayoutRule["layoutPreset"];
            await this.plugin.saveAndApplySettings();
          });
      });
      setting.addExtraButton((button) => button
        .setIcon("arrow-up")
        .setTooltip("提高优先级")
        .setDisabled(index === 0)
        .onClick(() => void this.moveCssClassLayoutRule(index, -1)));
      setting.addExtraButton((button) => button
        .setIcon("arrow-down")
        .setTooltip("降低优先级")
        .setDisabled(index === this.plugin.settings.cssClassLayoutRules.length - 1)
        .onClick(() => void this.moveCssClassLayoutRule(index, 1)));
      setting.addExtraButton((button) => button
        .setIcon("trash-2")
        .setTooltip("删除规则")
        .onClick(() => void this.removeCssClassLayoutRule(rule.id)));
    });

    new Setting(container)
      .setName("添加自动版式规则")
      .setDesc("一个 class 对应一个跟随 Obsidian、推荐版式或已保存的自定义模板。")
      .addButton((button) => button
        .setButtonText("添加规则")
        .setCta()
        .onClick(() => void this.addCssClassLayoutRule()));
  }

  private async addCssClassLayoutRule(): Promise<void> {
    this.plugin.settings.cssClassLayoutRules.push({
      id: `css-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      cssClass: "",
      layoutPreset: "default",
    });
    await this.plugin.saveAndApplySettings();
    this.display();
  }

  private async moveCssClassLayoutRule(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (target < 0 || target >= this.plugin.settings.cssClassLayoutRules.length) return;
    const [rule] = this.plugin.settings.cssClassLayoutRules.splice(index, 1);
    if (!rule) return;
    this.plugin.settings.cssClassLayoutRules.splice(target, 0, rule);
    await this.plugin.saveAndApplySettings();
    this.display();
  }

  private async removeCssClassLayoutRule(id: string): Promise<void> {
    this.plugin.settings.cssClassLayoutRules = this.plugin.settings.cssClassLayoutRules.filter(
      (rule) => rule.id !== id,
    );
    await this.plugin.saveAndApplySettings();
    this.display();
  }

  private addFontPickerSetting(
    container: HTMLElement,
    name: string,
    key: FontSettingKey,
    description = "",
  ): void {
    const current = this.plugin.getGlobalLayoutSettings()[key];
    const label = name.replace(/字体$/, "");
    new Setting(container)
      .setName(name)
      .setDesc(`${description}${description ? " " : ""}当前：${getFontStackSummary(current)}`)
      .setClass("cw-settings-font-setting")
      .addButton((button) => {
        button
          .setButtonText(`${getFontStackSummary(current)}  ›`)
          .onClick(() => {
            new FontPickerModal(this.app, label, current, (fontFamily) => {
              this.plugin.markGlobalLayoutPresetEdited();
              this.plugin.previewGlobalLayoutSettings({ [key]: fontFamily });
              void this.plugin.saveAndApplySettings().then(() => this.display());
            }).open();
          });
        button.buttonEl.style.fontFamily = current;
      });
  }

  private addSliderSetting(
    container: HTMLElement,
    name: string,
    unit: string,
    minimum: number,
    maximum: number,
    step: number,
    getValue: () => number,
    setValue: (value: number) => Promise<void>,
  ): void {
    const setting = new Setting(container).setName(name);
    const description = setting.descEl.createSpan();
    const updateLabel = (value: number): void => {
      description.setText(`${value} ${unit}`);
    };
    updateLabel(getValue());
    setting.addSlider((slider) =>
      slider
        .setLimits(minimum, maximum, step)
        .setDynamicTooltip()
        .setValue(getValue())
        .onChange(async (value) => {
          updateLabel(value);
          await setValue(value);
        }),
    );
  }
}
