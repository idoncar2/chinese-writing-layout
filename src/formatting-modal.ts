import {
  type Editor,
  Modal,
  Setting,
  setIcon,
} from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import {
  FORMATTING_PRESETS,
  FORMATTING_RULE_GROUPS,
  FORMATTING_RULES,
} from "./formatting";
import {
  DEFAULT_FORMATTING_RULE_ORDER,
  DEFAULT_MARKDOWN_FORMATTING_OPTIONS,
  normalizeMarkdownFormattingOptions,
  type BuiltinFormattingPresetId,
  type FormattingPresetId,
  type FormattingRuleKey,
  type FormattingRules,
  type MarkdownFormattingOptions,
  type MarkdownRepairOptions,
} from "./types";

const BUILTIN_PRESET_LABELS: Record<BuiltinFormattingPresetId, string> = {
  novel: "小说整洁",
  compact: "紧凑正文",
  punctuation: "中文标点整理",
};

const MARKDOWN_MODE_OPTIONS: Array<{
  value: MarkdownFormattingOptions["mode"];
  label: string;
}> = [
  { value: "none", label: "不处理" },
  { value: "repair", label: "修复 Markdown" },
  { value: "strip", label: "移除 Markdown" },
];

const MARKDOWN_REPAIR_OPTIONS: Array<{
  key: keyof MarkdownRepairOptions;
  label: string;
}> = [
  { key: "bold", label: "粗体" },
  { key: "italic", label: "斜体" },
  { key: "strikethrough", label: "删除线" },
  { key: "markdownLink", label: "Markdown 链接" },
  { key: "obsidianLink", label: "Obsidian 双链" },
  { key: "list", label: "列表" },
  { key: "blockquote", label: "引用" },
  { key: "heading", label: "标题" },
];

function isBuiltinPreset(value: string): value is BuiltinFormattingPresetId {
  return value === "novel" || value === "compact" || value === "punctuation";
}

function cloneMarkdownFormatting(
  options: MarkdownFormattingOptions,
): MarkdownFormattingOptions {
  const normalized = normalizeMarkdownFormattingOptions(options);
  return {
    mode: normalized.mode,
    protectSyntax: normalized.protectSyntax,
    repair: { ...normalized.repair },
  };
}

function createButton(
  parent: HTMLElement,
  text: string,
  cls?: string,
): HTMLButtonElement {
  const button = parent.createEl("button", { text, cls }) as HTMLButtonElement;
  button.type = "button";
  return button;
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
  private markdownFormatting: MarkdownFormattingOptions;
  private presetSectionEl?: HTMLElement;
  private ruleSectionEl?: HTMLElement;
  private markdownSectionEl?: HTMLElement;
  private isAdjustingOrder = false;
  private restoreScrollFrame?: number;

  constructor(
    private plugin: ChineseWritingLayoutPlugin,
    private editor: Editor,
  ) {
    super(plugin.app);
    this.preset = plugin.settings.formattingPreset;
    this.rules = { ...plugin.settings.formattingRules };
    this.ruleOrder = [...plugin.settings.formattingRuleOrder];
    this.markdownFormatting = cloneMarkdownFormatting(plugin.settings.markdownFormatting);
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

    this.presetSectionEl = this.contentEl.createDiv({ cls: "cw-format-section cw-format-preset-section" });
    this.ruleSectionEl = this.contentEl.createDiv({ cls: "cw-format-section cw-format-rules-section" });
    this.markdownSectionEl = this.contentEl.createDiv({ cls: "cw-format-section cw-format-markdown-section" });
    this.renderPresetSection();
    this.renderRuleSection();
    this.renderMarkdownSection();

    const footer = this.contentEl.createDiv({ cls: "cw-format-footer" });
    const batchButton = createButton(footer, "批量排版…");
    batchButton.addEventListener("click", () => {
      this.plugin.openBatchFormattingModal({
        preset: this.preset,
        rules: { ...this.rules },
        ruleOrder: [...this.ruleOrder],
        markdownFormatting: cloneMarkdownFormatting(this.markdownFormatting),
      });
    });
    const resetButton = createButton(footer, "恢复推荐方案");
    resetButton.addEventListener("click", () => this.selectPreset("novel"));
    const cancelButton = createButton(footer, "取消");
    cancelButton.addEventListener("click", () => this.close());
    const applyButton = createButton(
      footer,
      this.editor.somethingSelected() ? "排版选区" : "排版整篇",
      "mod-cta",
    );
    applyButton.addEventListener("click", () => {
      void this.plugin
        .applyFormatting(
          this.editor,
          this.rules,
          this.preset,
          true,
          this.ruleOrder,
          this.markdownFormatting,
        )
        .then(() => this.close());
    });
  }

  onClose(): void {
    if (this.restoreScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreScrollFrame);
      this.restoreScrollFrame = undefined;
    }
    this.contentEl.empty();
  }

  /**
   * 在重渲染整个分区（如勾选规则、切换 Markdown 处理方式）时保持弹窗滚动位置，
   * 避免“选择选项后界面跳回顶部”。复用了设置页 / 写作面板相同的
   * scrollTop → 重渲染 → requestAnimationFrame 恢复 模式，不使用固定延时。
   *
   * 注意：Obsidian 的 `.modal` 元素本身带 `overflow: auto`，是真正滚动容器；
   * `.modal-content` 只是 `flex: 1 1 auto`，不会滚动。因此要记录并恢复
   * `modalEl` 的 scrollTop（对 `contentEl` 也一并设置，兼容不同版本，
   * 在非滚动元素上设置 scrollTop 是无害空操作）。
   */
  private withScrollRestore(render: () => void): void {
    const scrollers = [
      { el: this.modalEl, scrollTop: this.modalEl.scrollTop },
      { el: this.contentEl, scrollTop: this.contentEl.scrollTop },
    ];
    if (this.restoreScrollFrame !== undefined) {
      window.cancelAnimationFrame(this.restoreScrollFrame);
    }
    render();
    this.restoreScrollFrame = window.requestAnimationFrame(() => {
      for (const { el, scrollTop } of scrollers) {
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.min(scrollTop, maxScrollTop);
      }
      this.restoreScrollFrame = undefined;
    });
  }

  private renderPresetSection(): void {
    const section = this.presetSectionEl;
    if (!section) return;
    section.empty();
    section.createEl("h3", { text: "排版方案" });
    section.createDiv({
      text: "内置方案可直接使用；自定义方案会保存规则、顺序和 Markdown 设置。",
      cls: "cw-format-section-hint",
    });
    const chips = section.createDiv({ cls: "cw-format-chip-list cw-format-preset-chips" });
    for (const preset of Object.keys(BUILTIN_PRESET_LABELS) as BuiltinFormattingPresetId[]) {
      this.createChip(
        chips,
        BUILTIN_PRESET_LABELS[preset],
        this.preset === preset,
        () => this.selectPreset(preset),
        FORMATTING_PRESETS[preset].label,
      );
    }
    if (this.preset === "custom") {
      this.createChip(chips, "当前自定义", true, () => undefined, "尚未保存的规则组合");
    }
    for (const saved of this.plugin.settings.customFormattingPresets) {
      this.createChip(
        chips,
        saved.name,
        this.preset === "saved:" + saved.id,
        () => this.selectPreset(("saved:" + saved.id) as FormattingPresetId),
        "已保存的自定义排版方案",
      );
    }

    const management = section.createDiv({ cls: "cw-format-preset-management" });
    management.createSpan({ text: "方案管理", cls: "cw-format-preset-management-label" });
    const actions = management.createDiv({ cls: "cw-format-preset-actions" });
    const savedId = this.preset.startsWith("saved:")
      ? this.preset.slice("saved:".length)
      : undefined;
    if (savedId) {
      const remove = createButton(actions, "删除方案", "mod-warning");
      remove.addEventListener("click", () => {
        void this.plugin.deleteCustomFormattingPreset(savedId).then(() => this.selectPreset("novel"));
      });
    }
    const saveAs = createButton(actions, savedId ? "另存为新方案…" : "保存为新方案…");
    saveAs.addEventListener("click", () => this.openSaveAsModal());
    if (savedId) {
      const saveChanges = createButton(actions, "保存修改", "mod-cta");
      saveChanges.addEventListener("click", () => {
        const name = this.plugin.settings.customFormattingPresets.find((item) => item.id === savedId)?.name
          ?? "自定义方案";
        void this.plugin.saveCustomFormattingPreset(
          name,
          this.rules,
          this.ruleOrder,
          savedId,
          this.markdownFormatting,
        ).then(() => this.withScrollRestore(() => this.renderPresetSection()));
      });
    }
  }

  private renderRuleSection(): void {
    const section = this.ruleSectionEl;
    if (!section) return;
    section.empty();
    const header = section.createDiv({ cls: "cw-format-section-header" });
    header.createEl("h3", { text: "执行规则" });
    const orderButton = createButton(
      header,
      this.isAdjustingOrder ? "完成排序" : "调整执行顺序",
      "cw-format-subtle-action",
    );
    orderButton.setAttribute("aria-pressed", String(this.isAdjustingOrder));
    orderButton.addEventListener("click", () => {
      this.isAdjustingOrder = !this.isAdjustingOrder;
      this.withScrollRestore(() => this.renderRuleSection());
    });

    const definitions = new Map(FORMATTING_RULES.map((definition) => [definition.key, definition]));
    if (this.isAdjustingOrder) {
      section.createDiv({
        text: "使用箭头调整已启用与未启用规则的执行顺序；平时不会显示这些控件。",
        cls: "cw-format-section-hint",
      });
      const list = section.createDiv({ cls: "cw-format-order-list" });
      for (const [index, key] of this.ruleOrder.entries()) {
        const definition = definitions.get(key);
        if (!definition) continue;
        const row = list.createDiv({ cls: "cw-format-order-row" });
        row.createSpan({ text: definition.label, cls: "cw-format-order-label" });
        const controls = row.createDiv({ cls: "cw-format-order-controls" });
        const moveUp = createButton(controls, "上移", "clickable-icon");
        moveUp.setAttribute("aria-label", "上移：" + definition.label);
        moveUp.disabled = index === 0;
        moveUp.addEventListener("click", () => this.moveRule(index, -1));
        const moveDown = createButton(controls, "下移", "clickable-icon");
        moveDown.setAttribute("aria-label", "下移：" + definition.label);
        moveDown.disabled = index === this.ruleOrder.length - 1;
        moveDown.addEventListener("click", () => this.moveRule(index, 1));
      }
      return;
    }

    for (const group of FORMATTING_RULE_GROUPS) {
      const groupEl = section.createDiv({ cls: "cw-format-rule-group" });
      groupEl.createEl("h4", { text: group.label });
      const options = groupEl.createDiv({ cls: "cw-format-check-grid" });
      for (const key of group.keys) {
        const definition = definitions.get(key);
        if (!definition) continue;
        this.createCheckOption(
          options,
          definition.label,
          this.rules[key],
          (next) => {
            this.rules[key] = next;
            this.resolveRuleConflicts(key, next);
            this.withScrollRestore(() => {
              this.markAsEdited();
              this.renderRuleSection();
            });
          },
          definition.description,
        );
      }
    }
  }

  private renderMarkdownSection(): void {
    const section = this.markdownSectionEl;
    if (!section) return;
    section.empty();
    section.createEl("h3", { text: "Markdown" });
    const protection = section.createEl("label", {
      cls: "cw-format-check-option cw-format-markdown-protection",
    });
    const protectionInput = protection.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    protectionInput.checked = this.markdownFormatting.protectSyntax;
    protectionInput.setAttribute("aria-label", "保护 Markdown 语法");
    protection.title = "排版正文时保护 Markdown 标记、链接目标和代码内容";
    protection.createSpan({ text: "保护 Markdown 语法", cls: "cw-format-check-label" });
    protection.toggleClass("is-checked", protectionInput.checked);
    protectionInput.addEventListener("change", () => {
      this.markdownFormatting = {
        ...this.markdownFormatting,
        protectSyntax: protectionInput.checked,
      };
      this.withScrollRestore(() => this.markAsEdited());
      protection.toggleClass("is-checked", protectionInput.checked);
    });

    section.createDiv({ text: "处理方式", cls: "cw-format-repair-title cw-format-markdown-mode-label" });
    const modes = section.createDiv({ cls: "cw-format-chip-list cw-format-markdown-modes" });
    modes.setAttribute("role", "radiogroup");
    modes.setAttribute("aria-label", "Markdown 处理方式");
    for (const option of MARKDOWN_MODE_OPTIONS) {
      const chip = this.createChip(
        modes,
        option.label,
        this.markdownFormatting.mode === option.value,
        () => {
          this.markdownFormatting = {
            ...this.markdownFormatting,
            mode: option.value,
          };
          this.withScrollRestore(() => {
            this.markAsEdited();
            this.renderMarkdownSection();
          });
        },
      );
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(this.markdownFormatting.mode === option.value));
    }

    if (this.markdownFormatting.mode !== "repair") return;

    const repair = section.createDiv({ cls: "cw-format-markdown-repair" });
    repair.createDiv({ text: "修复内容", cls: "cw-format-repair-title" });
    repair.createDiv({
      text: "仅尝试修复常见且可以较可靠判断的 Markdown 标记，不保证所有异常 Markdown 都能完全恢复。",
      cls: "cw-format-section-hint",
    });
    const options = repair.createDiv({ cls: "cw-format-check-grid" });
    for (const option of MARKDOWN_REPAIR_OPTIONS) {
      this.createCheckOption(
        options,
        option.label,
        this.markdownFormatting.repair[option.key],
        (next) => {
          this.markdownFormatting = {
            ...this.markdownFormatting,
            repair: {
              ...this.markdownFormatting.repair,
              [option.key]: next,
            },
          };
          this.withScrollRestore(() => {
            this.markAsEdited();
            this.renderMarkdownSection();
          });
        },
      );
    }
  }

  private createChip(
    parent: HTMLElement,
    label: string,
    active: boolean,
    onClick: () => void,
    tooltip?: string,
  ): HTMLButtonElement {
    const chip = createButton(parent, label, "cw-format-chip");
    chip.toggleClass("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
    if (tooltip) chip.title = tooltip;
    chip.addEventListener("click", onClick);
    return chip;
  }

  private createCheckOption(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    tooltip?: string,
  ): HTMLInputElement {
    const option = parent.createEl("label", { cls: "cw-format-check-option" });
    const input = option.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    input.checked = checked;
    input.setAttribute("aria-label", label);
    option.createSpan({ text: label, cls: "cw-format-check-label" });
    option.toggleClass("is-checked", checked);
    if (tooltip) option.title = tooltip;
    input.addEventListener("change", () => {
      option.toggleClass("is-checked", input.checked);
      onChange(input.checked);
    });
    return input;
  }

  private openSaveAsModal(): void {
    new PresetNameModal(this.plugin, "", (name) => {
      void this.plugin.saveCustomFormattingPreset(
        name,
        this.rules,
        this.ruleOrder,
        undefined,
        this.markdownFormatting,
      ).then((id) => this.selectPreset(("saved:" + id) as FormattingPresetId));
    }).open();
  }

  private selectPreset(preset: FormattingPresetId): void {
    this.preset = preset;
    this.isAdjustingOrder = false;
    if (isBuiltinPreset(preset)) {
      this.rules = { ...FORMATTING_PRESETS[preset].rules };
      this.ruleOrder = [...DEFAULT_FORMATTING_RULE_ORDER];
      this.markdownFormatting = cloneMarkdownFormatting(DEFAULT_MARKDOWN_FORMATTING_OPTIONS);
    } else if (preset.startsWith("saved:")) {
      const id = preset.slice("saved:".length);
      const saved = this.plugin.settings.customFormattingPresets.find((item) => item.id === id);
      if (saved) {
        this.rules = { ...saved.rules };
        this.ruleOrder = [...saved.ruleOrder];
        this.markdownFormatting = cloneMarkdownFormatting(saved.markdownFormatting);
      }
    }
    this.withScrollRestore(() => {
      this.renderPresetSection();
      this.renderRuleSection();
      this.renderMarkdownSection();
    });
  }

  private moveRule(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.ruleOrder.length) return;
    [this.ruleOrder[index], this.ruleOrder[target]] = [this.ruleOrder[target], this.ruleOrder[index]];
    this.withScrollRestore(() => {
      this.markAsEdited();
      this.renderRuleSection();
    });
  }

  private markAsEdited(): void {
    if (!this.preset.startsWith("saved:")) this.preset = "custom";
    this.renderPresetSection();
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
