import { App, Modal, Setting, setIcon } from "obsidian";
import {
  createFontFamilyStack,
  extractGenericFontFamily,
  extractFontFamilyNames,
  fontNameToCssFamily,
  getInstalledFontFamilies,
  type GenericFontFamily,
} from "./system-fonts";

export const FONT_PRESET_OPTIONS = [
  {
    id: "serif",
    label: "宋体",
    fontFamily: '"思源宋体", "Source Han Serif SC", "Noto Serif CJK SC", "宋体", serif',
  },
  {
    id: "sans",
    label: "黑体",
    fontFamily: '"思源黑体", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "微软雅黑", sans-serif',
  },
  {
    id: "kai",
    label: "楷体",
    fontFamily: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
  },
  {
    id: "fangsong",
    label: "仿宋",
    fontFamily: '"FangSong", "STFangsong", "仿宋", serif',
  },
] as const;

export function normalizeFontFamily(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export class FontPickerModal extends Modal {
  private availableFonts: string[] = [];
  private selectedFonts: string[];
  private genericFallback: GenericFontFamily;
  private searchValue = "";
  private listEl?: HTMLElement;
  private selectedListEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private fallbackSelectEl?: HTMLSelectElement;
  private opened = false;
  private draggedFontIndex: number | null = null;

  constructor(
    app: App,
    private roleLabel: string,
    currentFontFamily: string,
    private onSubmit: (fontFamily: string) => void,
  ) {
    super(app);
    this.selectedFonts = extractFontFamilyNames(currentFontFamily);
    this.genericFallback = extractGenericFontFamily(
      currentFontFamily,
      roleLabel === "标题" ? "sans-serif" : "serif",
    );
  }

  onOpen(): void {
    this.opened = true;
    this.modalEl.addClass("cw-font-picker-modal");
    this.setTitle(`选择${this.roleLabel}字体`);

    this.contentEl.createEl("p", {
      text: "按从上到下的顺序尝试字体。第一种字体不可用时，会继续使用下一种；可拖动排序，也可用箭头按钮调整。",
      cls: "cw-font-picker-intro",
    });

    const selectedHeader = this.contentEl.createDiv({ cls: "cw-font-section-header" });
    selectedHeader.createEl("h3", { text: "字体读取顺序" });
    selectedHeader.createSpan({ text: "第一项优先", cls: "cw-font-section-note" });
    this.selectedListEl = this.contentEl.createDiv({
      cls: "cw-font-selected-list",
      attr: { "aria-label": `${this.roleLabel}字体读取顺序` },
    });
    this.renderSelectedFonts();

    const presets = this.contentEl.createDiv({ cls: "cw-font-presets" });
    presets.createSpan({ text: "快速组合", cls: "cw-font-presets-label" });
    for (const option of FONT_PRESET_OPTIONS) {
      const button = presets.createEl("button", {
        text: option.label,
        attr: { type: "button", title: `使用${option.label}字体组合` },
      });
      button.addEventListener("click", () => {
        this.selectedFonts = extractFontFamilyNames(option.fontFamily);
        this.genericFallback = extractGenericFontFamily(option.fontFamily);
        if (this.fallbackSelectEl) this.fallbackSelectEl.value = this.genericFallback;
        this.renderSelectedFonts();
        this.renderFontList();
      });
    }

    new Setting(this.contentEl)
      .setName("最后后备字体")
      .setDesc("前面的字体都不可用时使用。")
      .setClass("cw-font-fallback-setting")
      .addDropdown((dropdown) => {
        this.fallbackSelectEl = dropdown.selectEl;
        return dropdown
          .addOption("serif", "衬线字体（宋体类）")
          .addOption("sans-serif", "无衬线字体（黑体类）")
          .addOption("monospace", "等宽字体")
          .setValue(this.genericFallback)
          .onChange((value) => {
          this.genericFallback = value as GenericFontFamily;
          });
      });

    const availableHeader = this.contentEl.createDiv({ cls: "cw-font-section-header" });
    availableHeader.createEl("h3", { text: "Windows 已安装字体" });
    availableHeader.createSpan({ text: "点击加入上方列表", cls: "cw-font-section-note" });

    const search = this.contentEl.createEl("input", {
      type: "search",
      placeholder: "搜索已安装字体…",
      cls: "cw-font-search",
      attr: { "aria-label": `搜索${this.roleLabel}字体` },
    });
    search.addEventListener("input", () => {
      this.searchValue = search.value;
      this.renderFontList();
    });
    window.setTimeout(() => search.focus(), 0);

    const meta = this.contentEl.createDiv({ cls: "cw-font-list-meta" });
    this.statusEl = meta.createSpan({ text: "正在扫描 Windows 已安装字体…" });
    const refresh = meta.createEl("button", {
      text: "重新扫描",
      attr: { type: "button" },
    });
    refresh.addEventListener("click", () => void this.loadFonts(true));

    this.listEl = this.contentEl.createDiv({ cls: "cw-font-list" });
    this.renderFontList();

    const advanced = this.contentEl.createEl("details", { cls: "cw-font-advanced" });
    advanced.createEl("summary", { text: "手动添加与字体安装说明" });
    advanced.createEl("p", {
      text: "下载 .ttf 或 .otf 后先在 Windows 中安装并重启 Obsidian，再重新扫描。未被自动识别的字体也可以在下方按名称加入。",
    });
    let manualValue = "";
    let manualInput: HTMLInputElement | null = null;
    const setting = new Setting(advanced)
      .setName("字体名称")
      .setDesc("例如：霞鹜文楷")
      .addText((text) => {
        manualInput = text.inputEl;
        text.setPlaceholder("输入一个字体名称").onChange((value) => { manualValue = value; });
      });
    setting.addButton((button) =>
      button.setButtonText("加入列表").onClick(() => {
        const value = manualValue.trim();
        if (!value) return;
        this.addSelectedFont(value);
        manualValue = "";
        if (manualInput) manualInput.value = "";
      }),
    );

    const footer = this.contentEl.createDiv({ cls: "cw-font-picker-footer" });
    const cancel = footer.createEl("button", { text: "取消", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const apply = footer.createEl("button", {
      text: "应用字体列表",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    apply.addEventListener("click", () => {
      this.onSubmit(createFontFamilyStack(this.selectedFonts, this.genericFallback));
      this.close();
    });

    void this.loadFonts(false);
  }

  private async loadFonts(refresh: boolean): Promise<void> {
    this.statusEl?.setText(refresh ? "正在重新扫描…" : "正在扫描 Windows 已安装字体…");
    const installed = await getInstalledFontFamilies(refresh);
    if (!this.opened) return;
    this.availableFonts = [...new Set(installed)].filter(Boolean).sort((left, right) =>
      left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }),
    );
    this.statusEl?.setText(
      installed.length > 0
        ? `已读取 ${installed.length.toLocaleString()} 种已安装字体`
        : "未能自动读取系统字体，仍可使用内置字体或手动输入",
    );
    this.renderFontList();
  }

  private renderFontList(): void {
    if (!this.listEl) return;
    this.listEl.empty();
    const query = this.searchValue.trim().toLocaleLowerCase("zh-CN");
    const filtered = query
      ? this.availableFonts.filter((font) => font.toLocaleLowerCase("zh-CN").includes(query))
      : this.availableFonts;
    if (filtered.length === 0) {
      this.listEl.createDiv({
        text: this.availableFonts.length === 0
          ? "正在读取 Windows 字体；如果一直为空，可以重新扫描或手动添加。"
          : "没有匹配字体。可以缩短关键词，或在下方手动添加。",
        cls: "cw-font-empty",
      });
      return;
    }

    const selected = new Set(this.selectedFonts.map((font) => font.toLocaleLowerCase("zh-CN")));
    for (const font of filtered) {
      const active = selected.has(font.toLocaleLowerCase("zh-CN"));
      const button = this.listEl.createEl("button", {
        cls: `cw-font-option${active ? " is-active" : ""}`,
        attr: {
          type: "button",
          "aria-pressed": String(active),
          title: active ? `${font} 已在字体列表中` : `将 ${font} 加入字体列表`,
        },
      });
      const label = button.createSpan({ text: font });
      label.style.fontFamily = fontNameToCssFamily(font);
      if (active) button.createSpan({ text: "已添加", cls: "cw-font-option-state" });
      button.disabled = active;
      button.addEventListener("click", () => {
        this.addSelectedFont(font);
      });
    }
  }

  private renderSelectedFonts(): void {
    if (!this.selectedListEl) return;
    this.selectedListEl.empty();
    if (this.selectedFonts.length === 0) {
      this.selectedListEl.createDiv({
        text: "尚未选择具体字体，将直接使用最后后备字体。",
        cls: "cw-font-selected-empty",
      });
      return;
    }

    this.selectedFonts.forEach((font, index) => {
      const row = this.selectedListEl!.createDiv({
        cls: "cw-font-selected-row",
      });
      row.createSpan({ text: `${index + 1}`, cls: "cw-font-selected-order" });
      const label = row.createSpan({ text: font, cls: "cw-font-selected-name" });
      label.style.fontFamily = fontNameToCssFamily(font);
      const actions = row.createDiv({ cls: "cw-font-selected-actions" });
      const up = actions.createEl("button", {
        attr: { type: "button", title: "上移", "aria-label": `上移 ${font}` },
      });
      setIcon(up, "chevron-up");
      up.disabled = index === 0;
      up.addEventListener("click", () => this.moveSelectedFont(index, index - 1));
      const down = actions.createEl("button", {
        attr: { type: "button", title: "下移", "aria-label": `下移 ${font}` },
      });
      setIcon(down, "chevron-down");
      down.disabled = index === this.selectedFonts.length - 1;
      down.addEventListener("click", () => this.moveSelectedFont(index, index + 1));
      const remove = actions.createEl("button", {
        attr: { type: "button", title: "移除", "aria-label": `移除 ${font}` },
      });
      setIcon(remove, "x");
      remove.addEventListener("click", () => {
        this.selectedFonts.splice(index, 1);
        this.renderSelectedFonts();
        this.renderFontList();
      });
      const grip = actions.createSpan({
        cls: "cw-font-selected-grip",
        attr: { draggable: "true", title: "拖动调整顺序", "aria-hidden": "true" },
      });
      setIcon(grip, "grip-vertical");

      grip.addEventListener("dragstart", (event) => {
        this.draggedFontIndex = index;
        row.addClass("is-dragging");
        event.dataTransfer?.setData("text/plain", `${index}`);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        if (this.draggedFontIndex !== null) this.moveSelectedFont(this.draggedFontIndex, index);
      });
      grip.addEventListener("dragend", () => {
        this.draggedFontIndex = null;
        row.removeClass("is-dragging");
      });
    });
  }

  private addSelectedFont(font: string): void {
    const normalized = font.trim().replace(/^(?:["'])(.*)(?:["'])$/, "$1");
    if (!normalized) return;
    const exists = this.selectedFonts.some(
      (item) => item.localeCompare(normalized, "zh-CN", { sensitivity: "base" }) === 0,
    );
    if (!exists) this.selectedFonts.push(normalized);
    this.renderSelectedFonts();
    this.renderFontList();
  }

  private moveSelectedFont(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || to >= this.selectedFonts.length) return;
    const [font] = this.selectedFonts.splice(from, 1);
    if (!font) return;
    this.selectedFonts.splice(to, 0, font);
    this.draggedFontIndex = null;
    this.renderSelectedFonts();
    this.renderFontList();
  }

  onClose(): void {
    this.opened = false;
    this.contentEl.empty();
  }
}
