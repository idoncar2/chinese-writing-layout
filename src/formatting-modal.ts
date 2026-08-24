import {
  type DropdownComponent,
  type Editor,
  Modal,
  Setting,
  setIcon,
  type ToggleComponent,
} from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import { FORMATTING_PRESETS, FORMATTING_RULES } from "./formatting";
import {
  DEFAULT_FORMATTING_RULE_ORDER,
  type BuiltinFormattingPresetId,
  type FormattingPresetId,
  type FormattingRuleKey,
  type FormattingRules,
} from "./types";

function isBuiltinPreset(value: string): value is BuiltinFormattingPresetId {
  return value === "novel" || value === "compact" || value === "punctuation";
}

class PresetNameModal extends Modal {
  constructor(
    plugin: ChineseWritingLayoutPlugin,
    private initialName: string,
    private onSubmit: (name: string) => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.setTitle("保存排版方案");
    let value = this.initialName;
    const setting = new Setting(this.contentEl)
      .setName("方案名称")
      .setDesc("例如：投稿版、纯净正文、个人阅读版")
      .addText((text) => {
        text.setValue(value).onChange((next) => { value = next; });
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

export class FormattingModal extends Modal {
  private preset: FormattingPresetId;
  private rules: FormattingRules;
  private ruleOrder: FormattingRuleKey[];
  private ruleListEl?: HTMLElement;
  private presetDropdown?: DropdownComponent;
  private presetActionsEl?: HTMLElement;
  private ruleToggles = new Map<FormattingRuleKey, ToggleComponent>();
  private restoreRuleListScrollFrame?: number;

  constructor(
    private plugin: ChineseWritingLayoutPlugin,
    private editor: Editor,
  ) {
    super(plugin.app);
    this.preset = plugin.settings.formattingPreset;
    this.rules = { ...plugin.settings.formattingRules };
    this.ruleOrder = [...plugin.settings.formattingRuleOrder];
  }

  onOpen(): void {
    this.modalEl.addClass("cw-format-modal");
    this.setTitle("一键排版");

    const intro = this.contentEl.createDiv({ cls: "cw-format-intro" });
    const introIcon = intro.createSpan({ cls: "cw-format-intro-icon" });
    setIcon(introIcon, "wand-sparkles");
    intro.createDiv({
      text: this.editor.somethingSelected()
        ? "检测到选区：本次只处理选中的文字。"
        : "没有选中文字：本次将自动处理整篇笔记。",
      cls: "cw-format-intro-text",
    });

    new Setting(this.contentEl)
      .setName("排版方案")
      .setDesc("可使用内置方案，也可以保存自己的规则组合。")
      .addDropdown((dropdown) => {
        this.presetDropdown = dropdown;
        this.populatePresetDropdown();
        dropdown.setValue(this.preset).onChange((value) => {
          this.selectPreset(value as FormattingPresetId);
        });
      });

    this.presetActionsEl = this.contentEl.createDiv({ cls: "cw-format-preset-actions" });
    this.renderPresetActions();

    const ruleHeader = this.contentEl.createDiv({ cls: "cw-format-rule-header" });
    ruleHeader.createEl("h3", { text: "执行规则" });
    ruleHeader.createSpan({ text: "使用箭头调整执行顺序" });
    this.ruleListEl = this.contentEl.createDiv({ cls: "cw-format-rule-list" });
    this.renderRuleList(false);

    const footer = this.contentEl.createDiv({ cls: "cw-format-footer" });
    const resetButton = footer.createEl("button", { text: "恢复推荐方案" });
    resetButton.addEventListener("click", () => this.selectPreset("novel"));
    const cancelButton = footer.createEl("button", { text: "取消" });
    cancelButton.addEventListener("click", () => this.close());
    const applyButton = footer.createEl("button", {
      text: this.editor.somethingSelected() ? "排版选区" : "排版整篇",
      cls: "mod-cta",
    });
    applyButton.addEventListener("click", () => {
      void this.plugin
        .applyFormatting(this.editor, this.rules, this.preset, true, this.ruleOrder)
        .then(() => this.close());
    });
  }

  onClose(): void {
    if (this.restoreRuleListScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreRuleListScrollFrame);
      this.restoreRuleListScrollFrame = undefined;
    }
    this.contentEl.empty();
  }

  private populatePresetDropdown(): void {
    const dropdown = this.presetDropdown;
    if (!dropdown) return;
    dropdown.selectEl.empty();
    dropdown
      .addOption("novel", FORMATTING_PRESETS.novel.label)
      .addOption("compact", FORMATTING_PRESETS.compact.label)
      .addOption("punctuation", FORMATTING_PRESETS.punctuation.label)
      .addOption("custom", "临时自定义");
    for (const preset of this.plugin.settings.customFormattingPresets) {
      dropdown.addOption(`saved:${preset.id}`, preset.name);
    }
  }

  private selectPreset(preset: FormattingPresetId): void {
    this.preset = preset;
    if (isBuiltinPreset(preset)) {
      this.rules = { ...FORMATTING_PRESETS[preset].rules };
      this.ruleOrder = [...DEFAULT_FORMATTING_RULE_ORDER];
    } else if (preset.startsWith("saved:")) {
      const id = preset.slice("saved:".length);
      const saved = this.plugin.settings.customFormattingPresets.find((item) => item.id === id);
      if (saved) {
        this.rules = { ...saved.rules };
        this.ruleOrder = [...saved.ruleOrder];
      }
    }
    this.presetDropdown?.setValue(preset);
    this.renderPresetActions();
    this.renderRuleList();
  }

  private renderPresetActions(): void {
    if (!this.presetActionsEl) return;
    this.presetActionsEl.empty();
    const savedId = this.preset.startsWith("saved:")
      ? this.preset.slice("saved:".length)
      : null;
    if (savedId) {
      const update = this.presetActionsEl.createEl("button", { text: "保存修改" });
      update.addEventListener("click", () => {
        void this.plugin.saveCustomFormattingPreset(
          this.plugin.settings.customFormattingPresets.find((item) => item.id === savedId)?.name ?? "自定义方案",
          this.rules,
          this.ruleOrder,
          savedId,
        );
      });
      const remove = this.presetActionsEl.createEl("button", { text: "删除方案" });
      remove.addEventListener("click", () => {
        void this.plugin.deleteCustomFormattingPreset(savedId).then(() => {
          this.populatePresetDropdown();
          this.selectPreset("novel");
        });
      });
    }
    const saveAs = this.presetActionsEl.createEl("button", { text: "另存为新方案…" });
    saveAs.addEventListener("click", () => {
      new PresetNameModal(this.plugin, "", (name) => {
        void this.plugin.saveCustomFormattingPreset(name, this.rules, this.ruleOrder).then((id) => {
          this.populatePresetDropdown();
          this.selectPreset(`saved:${id}`);
        });
      }).open();
    });
  }

  private renderRuleList(preserveScroll = true): void {
    const ruleList = this.ruleListEl;
    if (!ruleList) return;
    const ruleListScrollTop = preserveScroll ? ruleList.scrollTop : 0;
    const contentScrollTop = preserveScroll ? this.contentEl.scrollTop : 0;
    const modalScrollTop = preserveScroll ? this.modalEl.scrollTop : 0;
    ruleList.empty();
    this.ruleToggles.clear();
    const definitions = new Map(FORMATTING_RULES.map((definition) => [definition.key, definition]));
    for (const [index, key] of this.ruleOrder.entries()) {
      const definition = definitions.get(key);
      if (!definition) continue;
      const setting = new Setting(ruleList)
        .setName(definition.label)
        .setDesc(definition.description)
        .addExtraButton((button) => button
          .setIcon("chevron-up")
          .setTooltip("上移")
          .setDisabled(index === 0)
          .onClick(() => this.moveRule(index, -1)))
        .addExtraButton((button) => button
          .setIcon("chevron-down")
          .setTooltip("下移")
          .setDisabled(index === this.ruleOrder.length - 1)
          .onClick(() => this.moveRule(index, 1)))
        .addToggle((toggle) => {
          this.ruleToggles.set(key, toggle);
          return toggle.setValue(this.rules[key]).onChange((value) => {
            this.rules[key] = value;
            this.resolveRuleConflicts(key, value);
            this.markAsEdited();
            this.syncRuleToggles();
          });
        });
      setting.settingEl.addClass("cw-format-rule");
    }
    if (preserveScroll) {
      this.restoreRuleListScroll(
        ruleList,
        ruleListScrollTop,
        contentScrollTop,
        modalScrollTop,
      );
    }
  }

  private syncRuleToggles(): void {
    for (const [key, toggle] of this.ruleToggles) toggle.setValue(this.rules[key]);
  }

  private restoreRuleListScroll(
    ruleList: HTMLElement,
    ruleListScrollTop: number,
    contentScrollTop: number,
    modalScrollTop: number,
  ): void {
    if (this.restoreRuleListScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreRuleListScrollFrame);
    }
    this.restoreRuleListScrollFrame = window.requestAnimationFrame(() => {
      this.restoreRuleListScrollFrame = window.requestAnimationFrame(() => {
        if (this.ruleListEl === ruleList) {
          ruleList.scrollTop = ruleListScrollTop;
          this.contentEl.scrollTop = contentScrollTop;
          this.modalEl.scrollTop = modalScrollTop;
        }
        this.restoreRuleListScrollFrame = undefined;
      });
    });
  }

  private moveRule(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.ruleOrder.length) return;
    [this.ruleOrder[index], this.ruleOrder[target]] = [this.ruleOrder[target], this.ruleOrder[index]];
    this.markAsEdited();
    this.renderRuleList();
  }

  private markAsEdited(): void {
    if (!this.preset.startsWith("saved:")) {
      this.preset = "custom";
      this.presetDropdown?.setValue("custom");
    }
    this.renderPresetActions();
  }

  private resolveRuleConflicts(changedKey: FormattingRuleKey, enabled: boolean): void {
    if (!enabled) return;
    const disable = (...keys: FormattingRuleKey[]): void => {
      for (const key of keys) this.rules[key] = false;
    };
    if (changedKey === "removeAllBlankLines") {
      disable("collapseBlankLines", "ensureBlankLineBetweenParagraphs");
    } else if (changedKey === "collapseBlankLines" || changedKey === "ensureBlankLineBetweenParagraphs") {
      disable("removeAllBlankLines");
    } else if (changedKey === "addSpacesBetweenChineseAndLatin") {
      disable("removeSpacesBetweenChineseAndLatin", "removeAllSpaces");
    } else if (changedKey === "removeSpacesBetweenChineseAndLatin") {
      disable("addSpacesBetweenChineseAndLatin");
    } else if (changedKey === "removeAllSpaces") {
      disable("collapseRepeatedSpaces", "addSpacesBetweenChineseAndLatin", "addManualIndentation");
    } else if (changedKey === "addManualIndentation") {
      disable("trimLeadingWhitespace", "removeAllSpaces", "removeManualIndentation");
    } else if (changedKey === "removeManualIndentation" || changedKey === "trimLeadingWhitespace") {
      disable("addManualIndentation");
    } else if (changedKey === "convertHalfwidthPunctuation") {
      disable("convertFullwidthPunctuation");
    } else if (changedKey === "convertFullwidthPunctuation") {
      disable("convertHalfwidthPunctuation");
    } else if (changedKey === "convertCurlyQuotesToCorner") {
      disable("convertCornerQuotesToCurly");
    } else if (changedKey === "convertCornerQuotesToCurly") {
      disable("convertCurlyQuotesToCorner");
    }
  }
}
