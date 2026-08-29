import {
  App,
  DropdownComponent,
  getAllTags,
  PluginSettingTab,
  setIcon,
  Setting,
  TFolder,
  ToggleComponent,
} from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import {
  FontPickerModal,
  getFontSelectionDisplayName,
  getFontSelectionPreviewFamily,
} from "./font-options";
import { fontSelectionToLegacyFontFamily, type FontRole } from "./font-selection";
import {
  DEFAULT_SETTINGS,
  PAPER_THEME_OPTIONS,
  TYPEWRITER_CURSOR_POSITIONS,
  type AutoApplyLayoutPresetId,
  type AutoApplyRule,
  type InterfaceAccentMode,
  type InterfaceMode,
  type LayoutPresetId,
  type LayoutPresetValues,
  type PaperTheme,
} from "./types";

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

type NumericLayoutSettingKey =
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "paragraphSpacing"
  | "firstLineIndent"
  | "contentWidth"
  | "leftMargin"
  | "rightMargin";

type AutoApplyRuleDraft = {
  kind: AutoApplyRule["kind"];
  folderPath: string;
  includeSubfolders: boolean;
  tag: string;
  pattern: string;
  cssClass: string;
  layoutPreset: AutoApplyLayoutPresetId;
  activateWritingMode: boolean;
};

export class ChineseWritingSettingTab extends PluginSettingTab {
  plugin: ChineseWritingLayoutPlugin;
  private knownTags?: string[];
  private autoApplyRuleDraft?: AutoApplyRuleDraft;
  private restoreScrollFrame?: number;
  private displayRevision = 0;

  constructor(app: App, plugin: ChineseWritingLayoutPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const renderRevision = ++this.displayRevision;
    const scrollContainer = this.getSettingsScrollContainer();
    const previousScrollTop = scrollContainer.scrollTop;
    if (this.restoreScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreScrollFrame);
    }
    this.knownTags = undefined;
    containerEl.empty();
    containerEl.addClass("cw-settings-page");

    const header = containerEl.createDiv({ cls: "cw-settings-header" });
    new Setting(header).setName("中文写作排版").setHeading();
    header.createEl("p", {
      text: "“写作模式”只为当前笔记开启写作显示，字号、行距与缩进通过右侧“版式微调”调整；“一键排版”才会按所选规则整理 Markdown 原文，并可立即撤销。",
      cls: "setting-item-description",
    });

    this.renderAppearanceSettings(containerEl);
    this.renderWritingModeSettings(containerEl);
    this.renderLayoutSettings(containerEl);
    this.renderWritingAssistanceSettings(containerEl);
    this.renderResetSettings(containerEl);
    this.restoreSettingsScroll(scrollContainer, previousScrollTop, renderRevision);
  }

  private renderAppearanceSettings(container: HTMLElement): void {
    const section = this.createSettingsSection(
      container,
      "外观与界面",
      "选择设置页和写作工坊的显示方式与重点色来源。",
    );
    const group = this.createSettingsGroup(section, "显示方式");

    new Setting(group)
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

    let customAccentSetting: Setting | undefined;
    new Setting(group)
      .setName("界面重点色")
      .setDesc("跟随系统皮肤时使用 Obsidian 当前主题的重点色；也可以改为自定义颜色。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("theme", "跟随系统皮肤")
          .addOption("custom", "自定义")
          .setValue(this.plugin.settings.interfaceAccentMode)
          .onChange(async (value) => {
            this.plugin.settings.interfaceAccentMode = value as InterfaceAccentMode;
            customAccentSetting?.settingEl.remove();
            customAccentSetting = this.renderCustomAccentSetting(group);
            await this.plugin.saveAndApplySettings();
          }),
      );

    customAccentSetting = this.renderCustomAccentSetting(group);
  }

  private renderCustomAccentSetting(container: HTMLElement): Setting | undefined {
    if (this.plugin.settings.interfaceAccentMode !== "custom") return undefined;
    return new Setting(container)
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

  private renderLayoutSettings(container: HTMLElement): void {
    const section = this.createSettingsSection(
      container,
      "正文排版",
      "这里设置全局默认版式；单篇笔记的独立版式仍在右侧写作工坊中调整。",
    );

    const fontGroup = this.createSettingsGroup(section, "字体");
    this.addFontPickerSetting(fontGroup, "正文字体", "fontFamily", "用于普通正文段落。");
    this.addFontPickerSetting(fontGroup, "标题字体", "headingFontFamily", "用于笔记标题和 Markdown 标题。");
    const fontGuide = fontGroup.createEl("details", { cls: "cw-settings-font-guide" });
    fontGuide.createEl("summary", { text: "更多字体设置" });
    this.addFontPickerSetting(fontGuide, "引用字体", "quoteFontFamily", "用于 > 引用段落。");
    this.addFontPickerSetting(fontGuide, "粗体字体", "boldFontFamily", "用于 **粗体** 内容。");
    this.addFontPickerSetting(fontGuide, "斜体字体", "italicFontFamily", "用于 *斜体* 内容。");
    fontGuide.createEl("p", {
      text: "以上三项就是特殊格式字体，可以分别设置。选择器中的“跟随正文”会随正文字体一起变化。",
    });

    const layoutGroup = this.createSettingsGroup(section, "版面");
    this.addSliderSetting(
      layoutGroup,
      "正文字号",
      "fontSize",
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
      layoutGroup,
      "行距",
      "lineHeight",
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
      layoutGroup,
      "字距",
      "letterSpacing",
      "像素",
      -1,
      4,
      0.1,
      () => this.plugin.getGlobalLayoutSettings().letterSpacing,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ letterSpacing: value });
        await this.plugin.saveAndApplySettings();
      },
    );
    this.addSliderSetting(
      layoutGroup,
      "段间距",
      "paragraphSpacing",
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
      layoutGroup,
      "首行缩进",
      "firstLineIndent",
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
      layoutGroup,
      "正文宽度",
      "contentWidth",
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
    this.addSliderSetting(
      layoutGroup,
      "左间距",
      "leftMargin",
      "字符",
      0,
      12,
      0.5,
      () => this.plugin.getGlobalLayoutSettings().leftMargin,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ leftMargin: value });
        await this.plugin.saveAndApplySettings();
      },
    );
    this.addSliderSetting(
      layoutGroup,
      "右间距",
      "rightMargin",
      "字符",
      0,
      12,
      0.5,
      () => this.plugin.getGlobalLayoutSettings().rightMargin,
      async (value) => {
        this.plugin.markGlobalLayoutPresetEdited();
        this.plugin.previewGlobalLayoutSettings({ rightMargin: value });
        await this.plugin.saveAndApplySettings();
      },
    );
    const justifySetting = new Setting(layoutGroup)
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
    justifySetting.settingEl.dataset.cwLayoutSettingKey = "justifyText";

    const paperGroup = this.createSettingsGroup(section, "纸张");
    let paperThemeSelect: HTMLSelectElement | undefined;
    const paperThemeSetting = new Setting(paperGroup)
      .setName("纸张主题")
      .setDesc("仅影响写作模式笔记的正文区域。")
      .addDropdown((dropdown) => {
        paperThemeSelect = dropdown.selectEl;
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
    paperThemeSetting.settingEl.dataset.cwLayoutSettingKey = "paperTheme";
    const customPaperSetting = new Setting(paperGroup)
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
            if (value && paperThemeSelect) paperThemeSelect.value = "custom";
            await this.plugin.saveAndApplySettings();
          });
      });
    customPaperSetting.settingEl.dataset.cwLayoutSettingKey = "customPaperImage";
  }

  private renderWritingAssistanceSettings(container: HTMLElement): void {
    const section = this.createSettingsSection(
      container,
      "写作辅助",
      "把编辑视图中的定位、提示与统计集中管理，不会修改正文。",
    );

    const typewriterGroup = this.createSettingsGroup(section, "打字机模式");
    typewriterGroup.createEl("p", {
      text: "让正在输入的一行停留在指定高度，只改变编辑视图，不会修改正文。",
      cls: "cw-settings-group-description",
    });
    new Setting(typewriterGroup)
      .setName("开启写作模式时自动启用")
      .setDesc("进入写作模式时自动启用；关闭写作模式后恢复自动前的手动状态。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoTypewriterOnWritingMode)
          .onChange(async (value) => {
            this.plugin.settings.autoTypewriterOnWritingMode = value;
            await this.plugin.saveAndApplySettings();
          }),
      );
    new Setting(typewriterGroup)
      .setName("光标位置")
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
    new Setting(typewriterGroup)
      .setName("手动开启打字机模式")
      .setDesc("开启后会记住状态，直到再次关闭；与自动启用相互独立。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.typewriterMode)
          .onChange(async (value) => {
            await this.plugin.setManualTypewriterMode(value);
          }),
      );

    const assistanceGroup = this.createSettingsGroup(section, "常规辅助");
    new Setting(assistanceGroup)
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
    new Setting(assistanceGroup)
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
    new Setting(assistanceGroup)
      .setName("字数统计口径")
      .setDesc("创作字数会忽略 Markdown 标记；正文字符数只排除 YAML 和空白。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("creative", "创作字数")
          .addOption("body-characters", "正文字符数")
          .setValue(this.plugin.settings.countMode)
          .onChange(async (value) => {
            this.plugin.settings.countMode = value === "body-characters"
              ? "body-characters"
              : "creative";
            await this.plugin.saveAndApplySettings();
          }),
      );
    new Setting(assistanceGroup)
      .setName("状态栏统计")
      .setDesc("按所选统计口径显示当前笔记字数和提示数量。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showStatusBar = value;
            await this.plugin.saveAndApplySettings();
          }),
      );
  }

  private renderResetSettings(container: HTMLElement): void {
    const section = this.createSettingsSection(
      container,
      "恢复设置",
      "这是插件级操作，不会修改 Markdown 正文、frontmatter 或用户数据。",
    );
    section.addClass("cw-settings-reset-section");
    const group = this.createSettingsGroup(section);
    group.createEl("p", {
      text: "恢复版式、写作辅助、排版方案和界面模式，并删除自定义模板。",
      cls: "cw-settings-reset-note",
    });
    new Setting(group)
      .setName("恢复全部插件设置")
        .setDesc("恢复后可以继续按需配置，不会影响笔记内容。")
        .addButton((button) =>
          button.setButtonText("恢复默认").onClick(async () => {
            this.autoApplyRuleDraft = undefined;
            const save = this.plugin.resetSettings();
            this.display();
            await save;
          }),
        );
  }

  private createSettingsSection(
    container: HTMLElement,
    title: string,
    description: string,
  ): HTMLElement {
    const section = container.createDiv({ cls: "cw-settings-section" });
    const header = section.createDiv({ cls: "cw-settings-section-header" });
    new Setting(header).setName(title).setHeading();
    header.createEl("p", {
      text: description,
      cls: "cw-settings-section-description",
    });
    return section;
  }

  private createSettingsGroup(container: HTMLElement, title?: string): HTMLElement {
    const group = container.createDiv({ cls: "cw-settings-group" });
    if (title) {
      new Setting(group).setName(title).setHeading().settingEl.addClass("cw-settings-group-title");
    }
    return group;
  }

  private getSettingsScrollContainer(): HTMLElement {
    return this.containerEl.closest<HTMLElement>(".vertical-tab-content") ?? this.containerEl;
  }

  private restoreSettingsScroll(
    scrollContainer: HTMLElement,
    scrollTop: number,
    renderRevision: number,
  ): void {
    this.restoreScrollFrame = window.requestAnimationFrame(() => {
      if (renderRevision !== this.displayRevision) return;
      this.restoreScrollFrame = window.requestAnimationFrame(() => {
        if (renderRevision !== this.displayRevision) return;
        const maxScrollTop = Math.max(
          0,
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
        );
        scrollContainer.scrollTop = Math.min(scrollTop, maxScrollTop);
        this.restoreScrollFrame = undefined;
      });
    });
  }

  private refreshRenderedLayoutSettings(): void {
    const layout = this.plugin.getGlobalLayoutSettings();
    const fontKeys: readonly FontSettingKey[] = [
      "fontFamily",
      "headingFontFamily",
      "quoteFontFamily",
      "boldFontFamily",
      "italicFontFamily",
    ];
    for (const key of fontKeys) {
      const setting = this.containerEl.querySelector<HTMLElement>(
        `[data-cw-layout-font-key="${key}"]`,
      );
      if (!setting) continue;
      const config = FONT_SETTING_CONFIG[key];
      const selection = layout[config.selectionKey];
      const displayName = getFontSelectionDisplayName(
        selection,
        this.plugin.settings.userFonts,
      );
      const description = setting.dataset.cwLayoutFontDescription ?? "";
      setting.querySelector<HTMLElement>(".setting-item-description")?.setText(
        `${description}${description ? " " : ""}当前：${displayName}`,
      );
      const button = setting.querySelector<HTMLButtonElement>("button");
      if (button) {
        button.textContent = `${displayName}  ›`;
        button.style.fontFamily = getFontSelectionPreviewFamily(
          selection,
          this.plugin.settings.userFonts,
        );
      }
    }

    const units: Record<NumericLayoutSettingKey, string> = {
      fontSize: "像素",
      lineHeight: "倍",
      letterSpacing: "像素",
      paragraphSpacing: "em",
      firstLineIndent: "字符",
      contentWidth: "汉字宽",
      leftMargin: "字符",
      rightMargin: "字符",
    };
    for (const key of Object.keys(units) as NumericLayoutSettingKey[]) {
      const setting = this.containerEl.querySelector<HTMLElement>(
        `[data-cw-layout-setting-key="${key}"]`,
      );
      if (!setting) continue;
      const value = layout[key];
      const input = setting.querySelector<HTMLInputElement>('input[type="range"]');
      if (input) input.value = `${value}`;
      setting.querySelector<HTMLElement>(".setting-item-description")?.setText(
        `${value} ${units[key]}`,
      );
    }

    const justifySetting = this.containerEl.querySelector<HTMLElement>(
      '[data-cw-layout-setting-key="justifyText"]',
    );
    const justifyToggle = justifySetting?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (justifyToggle) justifyToggle.checked = layout.justifyText;

    const paperThemeSetting = this.containerEl.querySelector<HTMLElement>(
      '[data-cw-layout-setting-key="paperTheme"]',
    );
    const paperThemeSelect = paperThemeSetting?.querySelector<HTMLSelectElement>("select");
    if (paperThemeSelect) paperThemeSelect.value = layout.paperTheme;

    const customPaperSetting = this.containerEl.querySelector<HTMLElement>(
      '[data-cw-layout-setting-key="customPaperImage"]',
    );
    const customPaperSelect = customPaperSetting?.querySelector<HTMLSelectElement>("select");
    if (customPaperSelect) customPaperSelect.value = layout.customPaperImage;
  }

  private renderWritingModeSettings(container: HTMLElement): void {
    const section = this.createSettingsSection(
      container,
      "写作范围与自动套用",
      "先设置默认范围，再配置自动套用规则。",
    );
    const defaultGroup = this.createSettingsGroup(section, "默认范围");

    new Setting(defaultGroup)
      .setName("默认开启写作模式")
      .setDesc("没有单篇开关或自动规则命中时，使用这个全局默认值。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.defaultWritingModeEnabled)
          .onChange(async (value) => {
            this.plugin.settings.defaultWritingModeEnabled = value;
            await this.plugin.saveAndApplySettings();
          }),
      );

    new Setting(defaultGroup)
      .setName("默认模板")
      .setDesc("全局写作模式使用的版式；自动规则可以为匹配的笔记指定另一套模板。")
      .addDropdown((dropdown) => {
        this.addLayoutPresetOptions(dropdown, true);
        dropdown.selectEl.dataset.cwLayoutPresetScope = "global";
        return dropdown
          .setValue(this.plugin.settings.layoutPreset)
          .onChange(async (value) => {
            const save = this.plugin.applyGlobalLayoutPreset(value as LayoutPresetId);
            this.refreshRenderedLayoutSettings();
            await save;
          });
      });

    this.renderSaveLayoutPreset(defaultGroup);

    const rulesGroup = this.createSettingsGroup(section, "自动套用规则");
    rulesGroup.createEl("p", {
      text: "按顺序匹配，第一条命中的规则生效。",
      cls: "cw-settings-group-description",
    });
    const list = rulesGroup.createDiv({ cls: "cw-settings-auto-rules" });
    this.renderAutoApplyRules(list);

    const addRuleSetting = new Setting(rulesGroup)
      .setName("添加规则")
      .setDesc("新规则默认匹配文件夹及其子文件夹，并自动开启写作模式。")
      .addButton((button) => button
        .setButtonText("添加规则")
        .onClick(() => this.addAutoApplyRule()));
    addRuleSetting.setClass("cw-settings-add-rule");

    this.renderLegacyActivationClass(rulesGroup);
  }

  private renderAutoApplyRules(list: HTMLElement): void {
    list.empty();
    this.plugin.settings.autoApplyRules.forEach((rule, index) => {
      this.renderAutoApplyRuleCard(list, rule, index, false);
    });

    const draft = this.getAutoApplyRuleDraftForDisplay();
    if (draft) {
      this.renderAutoApplyRuleCard(
        list,
        draft,
        this.plugin.settings.autoApplyRules.length,
        true,
      );
    } else if (this.plugin.settings.autoApplyRules.length === 0) {
      list.createDiv({
        text: "还没有自动套用规则。点击“添加规则”开始创建。",
        cls: "cw-settings-auto-rules-empty",
      });
    }
  }

  private refreshAutoApplyRules(): void {
    const list = this.containerEl.querySelector<HTMLElement>(".cw-settings-auto-rules");
    if (list) this.renderAutoApplyRules(list);
  }

  private renderSaveLayoutPreset(container: HTMLElement): void {
    let templateName = "";
    let saveTemplateButton: HTMLButtonElement | undefined;
    let templateInput: HTMLInputElement | undefined;
    let templateDescription: HTMLElement | undefined;
    const setting = new Setting(container)
      .setName("保存当前版式为模板")
      .setDesc(
        this.plugin.settings.customLayoutPresets.length > 0
          ? `已保存 ${this.plugin.settings.customLayoutPresets.length} 个自定义模板；保存后可在默认模板和自动规则中选择。`
          : "先将当前版式保存并命名，保存后即可在默认模板和自动规则中选择。",
      );
    templateDescription = setting.descEl;
    setting
      .addText((text) => {
        templateInput = text.inputEl;
        return text
          .setPlaceholder("例如：小说正文")
          .onChange((value) => {
            templateName = value.trim();
            if (saveTemplateButton) saveTemplateButton.disabled = templateName.length === 0;
          });
      })
      .addButton((button) => {
        saveTemplateButton = button.buttonEl;
        return button
          .setButtonText("保存模板")
          .setDisabled(true)
          .onClick(async () => {
            if (!templateName) return;
            await this.plugin.saveCustomLayoutPreset(templateName);
            templateName = "";
            if (templateInput) templateInput.value = "";
            if (saveTemplateButton) saveTemplateButton.disabled = true;
            templateDescription?.setText(
              "已保存 "
              + this.plugin.settings.customLayoutPresets.length
              + " 个自定义模板；保存后可在默认模板和自动规则中选择。",
            );
            this.refreshRenderedLayoutSettings();
            this.refreshLayoutPresetOptions();
          });
      });
  }

  private getAutoApplyRuleDraftForDisplay(): AutoApplyRuleDraft | undefined {
    // 草稿只在点击“添加规则”时创建，绝不在渲染时自动补一张“待设置”空草稿。
    return this.autoApplyRuleDraft;
  }

  private createAutoApplyRuleDraft(): AutoApplyRuleDraft {
    return {
      kind: "folder",
      folderPath: "",
      includeSubfolders: true,
      tag: "",
      pattern: "",
      cssClass: "",
      layoutPreset: "default",
      activateWritingMode: true,
    };
  }

  private isAutoApplyRuleDraftComplete(draft: AutoApplyRuleDraft): boolean {
    switch (draft.kind) {
      case "folder":
        return draft.folderPath.trim().length > 0;
      case "tag":
        return draft.tag.trim().length > 0;
      case "filename":
        return draft.pattern.trim().length > 0;
      case "css-class":
        return draft.cssClass.trim().length > 0;
    }
  }

  private renderAutoApplyRuleCard(
    container: HTMLElement,
    rule: AutoApplyRule | AutoApplyRuleDraft,
    index: number,
    isDraft: boolean,
  ): void {
    const card = container.createDiv({ cls: "cw-settings-rule-card" });
    if (isDraft) card.addClass("is-draft");

    const header = card.createDiv({ cls: "cw-settings-rule-card-header" });
    const title = header.createDiv({ cls: "cw-settings-rule-card-title" });
    title.createSpan({ text: `规则 ${index + 1}` });
    title.createSpan({
      text: isDraft ? "待设置" : index === 0 ? "优先级最高" : `优先级 ${index + 1}`,
      cls: `cw-settings-rule-status${index === 0 && !isDraft ? " is-primary" : ""}`,
    });

    const actions = header.createDiv({ cls: "cw-settings-rule-actions" });
    this.createAutoApplyRuleIconButton(
      actions,
      "arrow-up",
      "上移规则",
      isDraft || index === 0,
      () => this.moveAutoApplyRule(index, -1),
    );
    this.createAutoApplyRuleIconButton(
      actions,
      "arrow-down",
      "下移规则",
      isDraft || index === this.plugin.settings.autoApplyRules.length - 1,
      () => this.moveAutoApplyRule(index, 1),
    );
    this.createAutoApplyRuleIconButton(
      actions,
      "trash-2",
      isDraft ? "取消草稿" : "删除规则",
      false,
      () => (isDraft
        ? this.cancelAutoApplyRuleDraft()
        : this.removeAutoApplyRule((rule as AutoApplyRule).id)),
    );

    this.renderAutoApplyRuleMatcher(card, rule, index, isDraft);
    this.renderAutoApplyRuleActions(card, rule, index, isDraft);
    if (isDraft) {
      card.createDiv({
        text: "选择匹配条件后，这条规则才会生效。",
        cls: "cw-settings-rule-draft-hint",
      });
    }
  }

  private createAutoApplyRuleIconButton(
    container: HTMLElement,
    icon: "arrow-up" | "arrow-down" | "trash-2",
    label: string,
    disabled: boolean,
    onClick: () => Promise<void>,
  ): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "clickable-icon",
      attr: {
        type: "button",
        "aria-label": label,
        title: label,
      },
    });
    setIcon(button, icon);
    button.disabled = disabled;
    button.addEventListener("click", () => void onClick());
    return button;
  }

  private renderAutoApplyRuleMatcher(
    container: HTMLElement,
    rule: AutoApplyRule | AutoApplyRuleDraft,
    index: number,
    isDraft: boolean,
  ): void {
    const row = container.createDiv({ cls: "cw-settings-rule-row cw-settings-rule-match" });
    row.createDiv({ text: "匹配条件", cls: "cw-settings-rule-row-label" });
    const controls = row.createDiv({ cls: "cw-settings-rule-controls cw-settings-rule-match-controls" });
    const draft = isDraft ? rule as AutoApplyRuleDraft : undefined;
    const current = isDraft ? undefined : rule as AutoApplyRule;

    const kindDropdown = new DropdownComponent(controls);
    kindDropdown
      .addOption("folder", "文件夹")
      .addOption("tag", "标签")
      .addOption("filename", "文件名")
      .addOption("css-class", "CSS Class（兼容）")
      .setValue(rule.kind);
    kindDropdown.selectEl.setAttribute("aria-label", `规则 ${index + 1} 的匹配类型`);
    kindDropdown.selectEl.setAttribute("data-cw-rule-type", "true");
    kindDropdown.onChange(async (value) => {
      if (draft) {
        this.changeAutoApplyRuleDraftKind(value as AutoApplyRule["kind"]);
        this.refreshAutoApplyRules();
        window.setTimeout(() => this.focusAutoApplyRuleMatcher(), 0);
        return;
      }
      await this.changeAutoApplyRuleKind(index, value as AutoApplyRule["kind"]);
    });

    switch (rule.kind) {
      case "folder": {
        const currentFolder = current as Extract<AutoApplyRule, { kind: "folder" }> | undefined;
        const folders = this.getLoadedVaultFolders();
        const folderDropdown = new DropdownComponent(controls);
        folderDropdown.addOption("", "选择文件夹");
        folderDropdown.addOption("/", "Vault 根目录");
        for (const folder of folders) folderDropdown.addOption(folder.path, folder.path);
        const folderPath = draft?.folderPath ?? currentFolder?.folderPath ?? "";
        if (
          folderPath
          && folderPath !== "/"
          && !folders.some((folder) => folder.path === folderPath)
        ) {
          folderDropdown.addOption(folderPath, `${folderPath}（文件夹不存在）`);
        }
        folderDropdown.setValue(folderPath);
        folderDropdown.selectEl.setAttribute("aria-label", `规则 ${index + 1} 的匹配文件夹`);
        folderDropdown.selectEl.setAttribute("data-cw-rule-matcher", "true");
        folderDropdown.onChange(async (value) => {
          if (draft) {
            draft.folderPath = value;
            await this.commitAutoApplyRuleDraft();
            return;
          }
          if (!currentFolder) return;
          currentFolder.folderPath = value;
          await this.plugin.saveAndApplySettings();
        });

        const checkboxLabel = controls.createEl("label", { cls: "cw-settings-rule-checkbox" });
        const checkbox = checkboxLabel.createEl("input", { type: "checkbox" });
        checkbox.checked = draft?.includeSubfolders ?? currentFolder?.includeSubfolders ?? true;
        checkbox.setAttribute("aria-label", `规则 ${index + 1} 包含子文件夹`);
        checkbox.addEventListener("change", async () => {
          if (draft) {
            draft.includeSubfolders = checkbox.checked;
            return;
          }
          if (!currentFolder) return;
          currentFolder.includeSubfolders = checkbox.checked;
          await this.plugin.saveAndApplySettings();
        });
        checkboxLabel.createSpan({ text: "包含子文件夹" });
        break;
      }
      case "tag": {
        const currentTag = current as Extract<AutoApplyRule, { kind: "tag" }> | undefined;
        const tags = this.getKnownTags();
        const tagDropdown = new DropdownComponent(controls);
        tagDropdown.addOption("", "选择标签");
        for (const tag of tags) tagDropdown.addOption(tag, tag);
        const tag = draft?.tag ?? currentTag?.tag ?? "";
        if (tag && !tags.includes(tag)) tagDropdown.addOption(tag, `${tag}（当前）`);
        tagDropdown.setValue(tag);
        tagDropdown.selectEl.setAttribute("aria-label", `规则 ${index + 1} 的匹配标签`);
        tagDropdown.selectEl.setAttribute("data-cw-rule-matcher", "true");
        tagDropdown.onChange(async (value) => {
          if (draft) {
            draft.tag = value;
            await this.commitAutoApplyRuleDraft();
            return;
          }
          if (!currentTag) return;
          currentTag.tag = value;
          await this.plugin.saveAndApplySettings();
        });
        break;
      }
      case "filename": {
        const currentFilename = current as Extract<AutoApplyRule, { kind: "filename" }> | undefined;
        const input = controls.createEl("input", {
          type: "text",
          cls: "cw-settings-rule-text-input",
          attr: {
            placeholder: "例如：Chapter *",
            title: "basename，不含 .md；整串匹配，* 表示任意字符，忽略英文大小写",
            "aria-label": `规则 ${index + 1} 的文件名匹配值`,
            "data-cw-rule-matcher": "true",
          },
        });
        input.value = draft?.pattern ?? currentFilename?.pattern ?? "";
        input.addEventListener("change", async () => {
          if (draft) {
            draft.pattern = input.value;
            await this.commitAutoApplyRuleDraft();
            return;
          }
          if (!currentFilename) return;
          currentFilename.pattern = input.value;
          await this.plugin.saveAndApplySettings();
        });
        controls.createDiv({
          text: "basename（不含 .md）整串匹配，* 表示任意字符，忽略英文大小写",
          cls: "cw-settings-rule-field-help",
        });
        break;
      }
      case "css-class": {
        const currentCssClass = current as Extract<AutoApplyRule, { kind: "css-class" }> | undefined;
        const input = controls.createEl("input", {
          type: "text",
          cls: "cw-settings-rule-text-input",
          attr: {
            placeholder: "例如：scene-romance",
            title: "高级兼容：匹配旧笔记中的 CSS Class",
            "aria-label": `规则 ${index + 1} 的 CSS Class 匹配值`,
            "data-cw-rule-matcher": "true",
          },
        });
        input.value = draft?.cssClass ?? currentCssClass?.cssClass ?? "";
        input.addEventListener("change", async () => {
          const normalized = input.value.trim().replace(/^\.+/u, "").split(/\s+/u)[0] ?? "";
          if (draft) {
            draft.cssClass = normalized;
            await this.commitAutoApplyRuleDraft();
            return;
          }
          if (!currentCssClass) return;
          currentCssClass.cssClass = normalized;
          await this.plugin.saveAndApplySettings();
        });
        controls.createDiv({
          text: "高级兼容语境，匹配旧笔记中的 CSS Class",
          cls: "cw-settings-rule-field-help",
        });
        break;
      }
    }
  }

  private renderAutoApplyRuleActions(
    container: HTMLElement,
    rule: AutoApplyRule | AutoApplyRuleDraft,
    index: number,
    isDraft: boolean,
  ): void {
    const row = container.createDiv({ cls: "cw-settings-rule-row cw-settings-rule-action" });
    row.createDiv({ text: "套用动作", cls: "cw-settings-rule-row-label" });
    const controls = row.createDiv({ cls: "cw-settings-rule-controls cw-settings-rule-action-controls" });
    const draft = isDraft ? rule as AutoApplyRuleDraft : undefined;
    const current = isDraft ? undefined : rule as AutoApplyRule;

    const presetDropdown = new DropdownComponent(controls);
    this.addLayoutPresetOptions(presetDropdown, false);
    presetDropdown.selectEl.dataset.cwLayoutPresetScope = "rule";
    presetDropdown.setValue(rule.layoutPreset);
    presetDropdown.selectEl.setAttribute("aria-label", `规则 ${index + 1} 的版式模板`);
    presetDropdown.onChange(async (value) => {
      rule.layoutPreset = value as AutoApplyLayoutPresetId;
      if (!draft && current) await this.plugin.saveAndApplySettings();
    });

    const toggleField = controls.createDiv({ cls: "cw-settings-rule-toggle" });
    const toggle = new ToggleComponent(toggleField);
    toggle
      .setValue(rule.activateWritingMode)
      .setTooltip("是否自动开启写作模式");
    toggle.toggleEl.setAttribute("aria-label", `规则 ${index + 1} 自动开启写作模式`);
    toggle.onChange(async (value) => {
      rule.activateWritingMode = value;
      if (!draft && current) await this.plugin.saveAndApplySettings();
    });
    toggleField.createSpan({ text: "自动开启写作模式" });
  }

  private addLayoutPresetOptions(dropdown: DropdownComponent, includeCustom: boolean): void {
    dropdown.addOption("default", "推荐写作版式");
    dropdown.addOption("obsidian", "跟随 Obsidian");
    if (includeCustom) dropdown.addOption("custom", "当前自定义设置");
    for (const preset of this.plugin.settings.customLayoutPresets) {
      dropdown.addOption(`saved:${preset.id}`, `已保存模板｜${preset.name}`);
    }
  }

  private refreshLayoutPresetOptions(): void {
    const selects = this.containerEl.querySelectorAll<HTMLSelectElement>(
      "[data-cw-layout-preset-scope]",
    );
    selects.forEach((select) => {
      const scope = select.dataset.cwLayoutPresetScope;
      const desiredValue = scope === "global"
        ? this.plugin.settings.layoutPreset
        : select.value;
      const includeCustom = scope === "global";
      while (select.firstChild) select.removeChild(select.firstChild);

      const values: string[] = [];
      const addOption = (value: string, label: string): void => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
        values.push(value);
      };
      addOption("default", "推荐写作版式");
      addOption("obsidian", "跟随 Obsidian");
      if (includeCustom) addOption("custom", "当前自定义设置");
      for (const preset of this.plugin.settings.customLayoutPresets) {
        addOption("saved:" + preset.id, "已保存模板｜" + preset.name);
      }
      select.value = values.includes(desiredValue) ? desiredValue : "default";
    });
  }

  private getLoadedVaultFolders(): TFolder[] {
    return this.plugin.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path.length > 0 && folder.path !== "/")
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private getKnownTags(): string[] {
    if (this.knownTags) return this.knownTags;
    const tags = new Set<string>();
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      for (const tag of getAllTags(cache) ?? []) tags.add(tag);
    }
    this.knownTags = [...tags].sort((left, right) => left.localeCompare(right));
    return this.knownTags;
  }

  private addAutoApplyRule(): void {
    if (this.autoApplyRuleDraft) {
      this.focusAutoApplyRuleMatcher();
      return;
    }
    this.autoApplyRuleDraft = this.createAutoApplyRuleDraft();
    this.refreshAutoApplyRules();
    window.setTimeout(() => this.focusAutoApplyRuleMatcher(), 0);
  }

  private changeAutoApplyRuleDraftKind(kind: AutoApplyRule["kind"]): void {
    const draft = this.autoApplyRuleDraft;
    if (!draft || draft.kind === kind) return;
    draft.kind = kind;
    draft.folderPath = "";
    draft.tag = "";
    draft.pattern = "";
    draft.cssClass = "";
    draft.includeSubfolders = kind === "folder";
  }

  private async commitAutoApplyRuleDraft(): Promise<void> {
    const draft = this.autoApplyRuleDraft;
    if (!draft || !this.isAutoApplyRuleDraftComplete(draft)) return;

    const common = {
      id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      layoutPreset: draft.layoutPreset,
      activateWritingMode: draft.activateWritingMode,
    };
    const rule: AutoApplyRule = draft.kind === "folder"
      ? {
        ...common,
        kind: "folder",
        folderPath: draft.folderPath,
        includeSubfolders: draft.includeSubfolders,
      }
      : draft.kind === "tag"
        ? { ...common, kind: "tag", tag: draft.tag }
        : draft.kind === "filename"
          ? { ...common, kind: "filename", pattern: draft.pattern }
          : { ...common, kind: "css-class", cssClass: draft.cssClass };

    this.plugin.settings.autoApplyRules.push(rule);
    this.autoApplyRuleDraft = undefined;
    this.refreshAutoApplyRules();
    await this.plugin.saveAndApplySettings();
  }

  private focusAutoApplyRuleMatcher(): void {
    const matcher = this.containerEl.querySelector<HTMLElement>(
      ".cw-settings-rule-card.is-draft [data-cw-rule-matcher]",
    );
    if (!matcher) return;
    matcher.focus();
    matcher.scrollIntoView?.({ block: "nearest" });
  }

  private async changeAutoApplyRuleKind(
    index: number,
    kind: AutoApplyRule["kind"],
  ): Promise<void> {
    const current = this.plugin.settings.autoApplyRules[index];
    if (!current || current.kind === kind) return;
    const common = {
      id: current.id,
      layoutPreset: current.layoutPreset,
      activateWritingMode: current.activateWritingMode,
    };
    const next: AutoApplyRule = kind === "folder"
      ? {
        ...common,
        kind,
        folderPath: "",
        includeSubfolders: true,
      }
      : kind === "tag"
        ? { ...common, kind, tag: "" }
        : kind === "filename"
          ? { ...common, kind, pattern: "" }
          : { ...common, kind, cssClass: "" };
    this.plugin.settings.autoApplyRules[index] = next;
    this.refreshAutoApplyRules();
    await this.plugin.saveAndApplySettings();
  }

  private async moveAutoApplyRule(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (target < 0 || target >= this.plugin.settings.autoApplyRules.length) return;
    const [rule] = this.plugin.settings.autoApplyRules.splice(index, 1);
    if (!rule) return;
    this.plugin.settings.autoApplyRules.splice(target, 0, rule);
    this.refreshAutoApplyRules();
    await this.plugin.saveAndApplySettings();
  }

  private async removeAutoApplyRule(id: string): Promise<void> {
    this.plugin.settings.autoApplyRules = this.plugin.settings.autoApplyRules.filter(
      (rule) => rule.id !== id,
    );
    // 删除最后一条已保存规则后不自动重建草稿，回到真正的“没有新规则”状态。
    this.refreshAutoApplyRules();
    await this.plugin.saveAndApplySettings();
  }

  private async cancelAutoApplyRuleDraft(): Promise<void> {
    if (!this.autoApplyRuleDraft) return;
    this.autoApplyRuleDraft = undefined;
    this.refreshAutoApplyRules();
  }

  private renderLegacyActivationClass(container: HTMLElement): void {
    const compatibility = container.createEl("details", { cls: "cw-settings-legacy-compatibility" });
    compatibility.createEl("summary", { text: "CSS Classes 兼容设置" });
    compatibility.createEl("p", {
      text: "仅为旧笔记兼容：activationClass 仍可作为旧版写作模式激活来源；新规则请使用上方 CSS Class（兼容）类型。",
      cls: "setting-item-description",
    });
    new Setting(compatibility)
      .setName("旧笔记激活类名")
      .setDesc("带有这个 cssclasses 值的旧笔记仍可进入写作模式。")
      .addText((text) => text
        .setPlaceholder("chinese-novel")
        .setValue(this.plugin.settings.activationClass)
        .onChange(async (value) => {
          const normalized = value.trim().replace(/^\.+/, "");
          this.plugin.settings.activationClass =
            normalized || DEFAULT_SETTINGS.activationClass;
          await this.plugin.saveAndApplySettings();
        }));
  }

  private addFontPickerSetting(
    container: HTMLElement,
    name: string,
    key: FontSettingKey,
    description = "",
  ): void {
    const config = FONT_SETTING_CONFIG[key];
    let currentSelection = this.plugin.getGlobalLayoutSettings()[config.selectionKey];
    const label = name.replace(/字体$/, "");
    const setting = new Setting(container)
      .setName(name)
      .setClass("cw-settings-font-setting");
    setting.settingEl.dataset.cwLayoutFontKey = key;
    setting.settingEl.dataset.cwLayoutFontDescription = description;
    const updateDisplay = (
      selection: LayoutPresetValues[FontSelectionSettingKey],
      button?: { setButtonText: (text: string) => unknown; buttonEl: HTMLButtonElement },
    ): void => {
      currentSelection = selection;
      const displayName = getFontSelectionDisplayName(
        selection,
        this.plugin.settings.userFonts,
      );
      setting.descEl.setText(`${description}${description ? " " : ""}当前：${displayName}`);
      if (button) {
        button.setButtonText(`${displayName}  ›`);
        button.buttonEl.style.fontFamily = getFontSelectionPreviewFamily(
          selection,
          this.plugin.settings.userFonts,
        );
      }
    };
    updateDisplay(currentSelection);
    setting.addButton((button) => {
        button
          .setButtonText(
            `${getFontSelectionDisplayName(currentSelection, this.plugin.settings.userFonts)}  ›`,
          )
          .onClick(() => {
            new FontPickerModal(
              this.app,
              label,
              currentSelection,
              this.plugin.settings.userFonts,
              (selection) => {
              const patch = {
                [config.selectionKey]: selection,
                [key]: fontSelectionToLegacyFontFamily(selection, config.role),
              } as Partial<LayoutPresetValues>;
              this.plugin.markGlobalLayoutPresetEdited();
              this.plugin.previewGlobalLayoutSettings(patch);
              updateDisplay(selection, button);
              void this.plugin.saveAndApplySettings();
              },
              {
                ...this.plugin.getFontPickerUserFontActions(),
                onUserFontsChanged: () => this.refreshRenderedLayoutSettings(),
              },
            ).open();
          });
        button.buttonEl.style.fontFamily = getFontSelectionPreviewFamily(
          currentSelection,
          this.plugin.settings.userFonts,
        );
      });
  }

  private addSliderSetting(
    container: HTMLElement,
    name: string,
    key: NumericLayoutSettingKey,
    unit: string,
    minimum: number,
    maximum: number,
    step: number,
    getValue: () => number,
    setValue: (value: number) => Promise<void>,
  ): void {
    const setting = new Setting(container).setName(name);
    setting.settingEl.dataset.cwLayoutSettingKey = key;
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
