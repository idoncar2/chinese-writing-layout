import { App, Modal, Setting, setIcon } from "obsidian";
import { findAvailableQuickFont, QUICK_FONT_OPTIONS } from "./quick-fonts";
import { fontNameToCssFamily, getSystemFontDisplayName } from "./system-fonts";
import type { FontSelection, UserFont } from "./types";

export interface BuiltinFontOption {
  id: string;
  name: string;
  previewFamily: string;
}

/** Reserved for a future verified resource; no bundled font files are shipped in this issue. */
export const BUILTIN_FONT_OPTIONS: readonly BuiltinFontOption[] = [];

export function getFontSelectionDisplayName(
  selection: FontSelection,
  userFonts: readonly UserFont[] = [],
  builtinFonts: readonly BuiltinFontOption[] = BUILTIN_FONT_OPTIONS,
): string {
  if (selection.source === "obsidian") return "跟随 Obsidian";
  if (selection.source === "inherit") return "跟随正文";
  if (selection.source === "builtin") {
    return builtinFonts.find((font) => font.id === selection.id)?.name ?? selection.id;
  }
  if (selection.source === "user") {
    return userFonts.find((font) => font.id === selection.id)?.name ?? selection.id;
  }
  return getSystemFontDisplayName(selection.id);
}

export function getFontSelectionPreviewFamily(
  selection: FontSelection,
  userFonts: readonly UserFont[] = [],
  builtinFonts: readonly BuiltinFontOption[] = BUILTIN_FONT_OPTIONS,
): string {
  if (selection.source === "obsidian") return "var(--font-text-theme)";
  if (selection.source === "inherit") return "inherit";
  if (selection.source === "builtin") {
    return builtinFonts.find((font) => font.id === selection.id)?.previewFamily ?? "serif";
  }
  if (selection.source === "user") {
    return fontNameToCssFamily(selection.id);
  }
  return fontNameToCssFamily(selection.id);
}

export interface FontPickerUserFontActions {
  getUserFonts?: () => readonly UserFont[];
  getAvailableUserFontIds?: () => ReadonlySet<string>;
  getFontUsageCount?: (id: string) => number;
  importFont?: (file: File) => Promise<UserFont | null>;
  renameFont?: (id: string, name: string) => Promise<boolean>;
  deleteFont?: (id: string) => Promise<boolean>;
  onUserFontsChanged?: () => void;
}

class UserFontNameModal extends Modal {
  constructor(
    app: App,
    private font: UserFont,
    private onSubmit: (name: string) => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("重命名字体");
    let value = this.font.name;
    let saveButton: HTMLButtonElement | undefined;
    const setting = new Setting(this.contentEl)
      .setName("显示名称")
      .setDesc("只修改插件内显示名称，不会改动字体文件。")
      .addText((text) => {
        text
          .setValue(value)
          .setPlaceholder("例如：霞鹜文楷")
          .onChange((next) => {
            value = next;
            if (saveButton) saveButton.disabled = value.trim().length === 0;
          });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });
    setting.addButton((button) => {
      saveButton = button.buttonEl;
      return button
        .setButtonText("保存")
        .setDisabled(value.trim().length === 0)
        .onClick(async () => {
          const name = value.trim();
          if (!name || !saveButton) return;
          saveButton.disabled = true;
          if (await this.onSubmit(name)) this.close();
          else saveButton.disabled = false;
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class UserFontDeleteModal extends Modal {
  constructor(
    app: App,
    private font: UserFont,
    private usageCount: number,
    private onConfirm: () => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("删除字体");
    this.contentEl.createEl("p", {
      text: this.usageCount > 0
        ? `该字体正在被 ${this.usageCount} 个版式位置使用，删除后相关位置将恢复为默认跟随设置。`
        : "删除后将无法在版式中选择该字体。",
    });
    this.contentEl.createEl("p", {
      text: `字体：${this.font.name}`,
      cls: "setting-item-description",
    });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText("确认删除")
        .setWarning()
        .onClick(async () => {
          button.setDisabled(true);
          if (await this.onConfirm()) this.close();
          else button.setDisabled(false);
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class FontPickerModal extends Modal {
  private selectedSelection: FontSelection;
  private sourceListEl?: HTMLElement;
  private userFonts: readonly UserFont[];

  constructor(
    app: App,
    private roleLabel: string,
    currentSelection: FontSelection,
    userFonts: readonly UserFont[],
    private onSubmit: (selection: FontSelection) => void,
    private actions: FontPickerUserFontActions = {},
  ) {
    super(app);
    this.selectedSelection = { ...currentSelection };
    this.userFonts = userFonts;
  }

  onOpen(): void {
    this.modalEl.addClass("cw-font-picker-modal");
    this.setTitle(`选择${this.roleLabel}字体`);
    this.contentEl.createEl("p", {
      text: "选择后立即应用。插件只保存当前字体引用，不会扫描电脑上的全部字体。",
      cls: "cw-font-picker-intro",
    });

    this.sourceListEl = this.contentEl.createDiv({ cls: "cw-font-source-list" });
    this.renderSourceGroups();
    this.renderFontHelp();

    const footer = this.contentEl.createDiv({ cls: "cw-font-picker-footer" });
    const done = footer.createEl("button", {
      text: "完成",
      attr: { type: "button" },
    });
    done.addEventListener("click", () => this.close());
  }

  private renderSourceGroups(): void {
    if (!this.sourceListEl) return;
    this.sourceListEl.empty();

    if (this.allowsBodyInheritance()) {
      this.renderChoiceSection(
        this.sourceListEl,
        "跟随正文",
        "引用、粗体和斜体会使用正文字体。",
        [{ source: "inherit", id: "body" }],
      );
    }

    this.renderChoiceSection(
      this.sourceListEl,
      "跟随 Obsidian",
      "交给当前主题和 Obsidian 的字体设置。",
      [{ source: "obsidian", id: this.roleLabel === "标题" ? "heading" : "text" }],
    );
    this.renderQuickFonts(this.sourceListEl);
    this.renderUserFonts(this.sourceListEl);
    this.renderSystemFontInput(this.sourceListEl);
  }

  private renderChoiceSection(
    root: HTMLElement,
    title: string,
    description: string,
    choices: readonly FontSelection[],
  ): void {
    const section = root.createDiv({ cls: "cw-font-source-section" });
    const header = section.createDiv({ cls: "cw-font-source-header" });
    header.createEl("h3", { text: title });
    header.createSpan({ text: description, cls: "cw-font-source-description" });
    const list = section.createDiv({
      cls: "cw-font-choice-list",
      attr: {
        role: "radiogroup",
        "aria-label": `${this.roleLabel}${title}`,
      },
    });
    for (const choice of choices) this.renderFontChoice(list, choice);
  }

  private renderQuickFonts(root: HTMLElement): void {
    const section = root.createDiv({ cls: "cw-font-source-section" });
    const header = section.createDiv({ cls: "cw-font-source-header" });
    header.createEl("h3", { text: "快捷字体" });
    header.createSpan({
      text: "使用当前设备已安装的常见字体",
      cls: "cw-font-source-description",
    });
    const list = section.createDiv({
      cls: "cw-font-choice-list cw-font-quick-list",
      attr: { role: "radiogroup", "aria-label": `${this.roleLabel}快捷字体` },
    });
    for (const option of QUICK_FONT_OPTIONS) {
      const availableFont = findAvailableQuickFont(option);
      const selection: FontSelection = {
        source: "system",
        id: availableFont ?? option.candidates[0]!,
      };
      this.renderFontChoice(
        list,
        selection,
        availableFont
          ? `当前设备候选：${getSystemFontDisplayName(availableFont)}`
          : "当前设备不可用；可导入字体",
        !availableFont,
        option.label,
      );
    }
  }

  private renderUserFonts(root: HTMLElement): void {
    const section = root.createDiv({ cls: "cw-font-source-section" });
    const header = section.createDiv({ cls: "cw-font-source-header cw-font-user-header" });
    const heading = header.createDiv({ cls: "cw-font-user-heading" });
    heading.createEl("h3", { text: "我的字体" });
    heading.createSpan({
      text: "独立保存，不受插件更新影响",
      cls: "cw-font-source-description",
    });
    const fileInput = section.createEl("input", {
      type: "file",
      cls: "cw-font-file-input",
      attr: {
        accept: ".ttf,.otf,.woff,.woff2",
        "aria-label": "选择字体文件",
      },
    });
    fileInput.hidden = true;
    const importButton = header.createEl("button", {
      text: "+ 导入字体",
      cls: "cw-font-import-button",
      attr: {
        type: "button",
        title: "导入 .ttf、.otf、.woff 或 .woff2 字体文件",
      },
    });
    importButton.disabled = !this.actions.importFont;
    importButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void this.importUserFont(file, importButton);
    });

    const list = section.createDiv({
      cls: "cw-font-choice-list",
      attr: { role: "radiogroup", "aria-label": `${this.roleLabel}我的字体` },
    });
    if (this.userFonts.length === 0) {
      list.createDiv({
        text: "还没有导入字体，点击右上角“+ 导入字体”。",
        cls: "cw-font-source-empty",
      });
      return;
    }
    for (const font of this.userFonts) this.renderUserFontChoice(list, font);
    if (this.selectedSelection.source === "user"
      && !this.userFonts.some((font) => font.id === this.selectedSelection.id)) {
      this.renderFontChoice(
        list,
        { source: "user", id: this.selectedSelection.id },
        "字体暂不可用，仍保留原引用。",
        true,
      );
    }
  }

  private renderUserFontChoice(list: HTMLElement, font: UserFont): void {
    const unavailable = !this.isUserFontAvailable(font.id);
    const selected = this.areSameSelection(
      { source: "user", id: font.id },
      this.selectedSelection,
    );
    const row = list.createDiv({
      cls: `cw-font-user-row${selected ? " is-selected" : ""}`,
    });
    this.renderFontChoice(
      row,
      { source: "user", id: font.id },
      unavailable
        ? `原文件：${font.originalFileName}；字体暂不可用，仍保留原引用。`
        : `原文件：${font.originalFileName}`,
      unavailable,
      font.name,
    );
    const actions = row.createDiv({
      cls: "cw-font-user-actions",
      attr: { "aria-label": `${font.name}管理操作` },
    });
    if (this.actions.renameFont) {
      const rename = actions.createEl("button", {
        attr: {
          type: "button",
          title: `重命名${font.name}`,
          "aria-label": `重命名${font.name}`,
        },
      });
      setIcon(rename, "pencil");
      rename.addEventListener("click", () => this.openRenameFont(font));
    }
    if (this.actions.deleteFont) {
      const remove = actions.createEl("button", {
        attr: {
          type: "button",
          title: `删除${font.name}`,
          "aria-label": `删除${font.name}`,
        },
      });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => this.openDeleteFont(font));
    }
  }

  private renderSystemFontInput(root: HTMLElement): void {
    const section = root.createDiv({ cls: "cw-font-source-section cw-font-system-section" });
    const header = section.createDiv({ cls: "cw-font-source-header" });
    header.createEl("h3", { text: "系统字体" });
    header.createSpan({ text: "高级选项", cls: "cw-font-source-description" });
    let inputEl: HTMLInputElement | undefined;
    const setting = new Setting(section)
      .setClass("cw-font-system-setting")
      .setName("使用系统字体名称")
      .setDesc("这里填写的是优先字体；当前设备未安装时会自动回退。")
      .addText((text) => {
        inputEl = text.inputEl;
        text
          .setPlaceholder("例如：PingFang SC")
          .setValue(this.selectedSelection.source === "system" ? this.selectedSelection.id : "");
      });
    const applySystemFont = (): void => {
      const value = inputEl?.value.trim() ?? "";
      if (!value) {
        inputEl?.focus();
        inputEl?.setAttribute("aria-invalid", "true");
        return;
      }
      inputEl?.removeAttribute("aria-invalid");
      this.selectFont({ source: "system", id: value });
    };
    inputEl?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applySystemFont();
    });
    setting.addButton((button) => button
      .setButtonText("应用")
      .onClick(applySystemFont));
  }

  private renderFontChoice(
    container: HTMLElement,
    selection: FontSelection,
    note?: string,
    disabled = false,
    displayNameOverride?: string,
  ): void {
    const selected = this.areSameSelection(selection, this.selectedSelection);
    const label = displayNameOverride
      ?? getFontSelectionDisplayName(selection, this.userFonts);
    const button = container.createEl("button", {
      cls: `cw-font-choice${selected ? " is-selected" : ""}`,
      attr: {
        type: "button",
        role: "radio",
        "aria-checked": String(selected),
        "aria-label": `${label}${selected ? "，已选" : ""}`,
        title: selected ? `${label}（当前选择）` : `选择${label}`,
      },
    });
    button.disabled = disabled;
    const marker = button.createSpan({
      cls: "cw-font-choice-marker",
      attr: { "aria-hidden": "true" },
    });
    if (selected) setIcon(marker, "check");
    const content = button.createDiv({ cls: "cw-font-choice-content" });
    content.createDiv({ text: label, cls: "cw-font-choice-name" });
    const preview = content.createDiv({
      text: "中文写作预览 Aa",
      cls: "cw-font-choice-preview",
    });
    preview.style.fontFamily = getFontSelectionPreviewFamily(selection, this.userFonts);
    if (note) {
      content.createDiv({
        text: note,
        cls: "cw-font-choice-note",
        attr: { title: note },
      });
    }
    button.addEventListener("click", () => this.selectFont(selection));
  }

  private renderFontHelp(): void {
    const help = this.contentEl.createEl("details", { cls: "cw-font-help" });
    help.createEl("summary", { text: "如何添加字体？" });
    help.createEl("p", {
      text: "查看已安装字体名称：在系统字体设置或字体列表中找到字体族名称。",
    });
    help.createEl("p", {
      text: "导入字体文件：点击“+ 导入字体”，选择 .ttf、.otf、.woff 或 .woff2 文件。",
    });
    help.createEl("p", {
      text: "快捷字体会随设备变化；如果需要跨设备保持一致，请在当前设备导入自己的字体文件。导入后会立即选中并应用。",
    });
  }

  private async importUserFont(file: File, button: HTMLButtonElement): Promise<void> {
    if (!this.actions.importFont) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const imported = await this.actions.importFont(file);
      if (imported) {
        this.refreshUserFontSnapshot();
        this.selectFont({ source: "user", id: imported.id });
      }
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  private openRenameFont(font: UserFont): void {
    if (!this.actions.renameFont) return;
    new UserFontNameModal(this.app, font, async (name) => {
      const renamed = await this.actions.renameFont!(font.id, name);
      if (!renamed) return false;
      this.refreshUserFontSnapshot();
      this.renderSourceGroups();
      return true;
    }).open();
  }

  private openDeleteFont(font: UserFont): void {
    if (!this.actions.deleteFont) return;
    const usageCount = this.actions.getFontUsageCount?.(font.id) ?? 0;
    new UserFontDeleteModal(this.app, font, usageCount, async () => {
      const deleted = await this.actions.deleteFont!(font.id);
      if (!deleted) return false;
      if (this.selectedSelection.source === "user" && this.selectedSelection.id === font.id) {
        this.selectedSelection = this.getFallbackSelection();
      }
      this.refreshUserFontSnapshot();
      this.renderSourceGroups();
      return true;
    }).open();
  }

  private refreshUserFontSnapshot(): void {
    this.userFonts = this.actions.getUserFonts?.() ?? this.userFonts;
    this.actions.onUserFontsChanged?.();
  }

  private isUserFontAvailable(id: string): boolean {
    const available = this.actions.getAvailableUserFontIds?.();
    return available ? available.has(id) : true;
  }

  private getFallbackSelection(): FontSelection {
    if (this.allowsBodyInheritance()) return { source: "inherit", id: "body" };
    return {
      source: "obsidian",
      id: this.roleLabel === "标题" ? "heading" : "text",
    };
  }

  private selectFont(selection: FontSelection): void {
    this.selectedSelection = { ...selection };
    this.applyCurrentSelection();
    this.renderSourceGroups();
  }

  private applyCurrentSelection(): void {
    this.onSubmit({ ...this.selectedSelection });
  }

  private allowsBodyInheritance(): boolean {
    return this.roleLabel !== "正文"
      && this.roleLabel !== "标题"
      && this.roleLabel !== "阅读";
  }

  private areSameSelection(left: FontSelection, right: FontSelection): boolean {
    return left.source === right.source && left.id === right.id;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
