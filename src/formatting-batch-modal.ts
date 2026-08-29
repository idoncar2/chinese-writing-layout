import {
  getAllTags,
  Modal,
  Notice,
  TFile,
} from "obsidian";
import type ChineseWritingLayoutPlugin from "./main";
import type {
  BatchFormattingRequest,
  BatchFormattingResult,
  BatchFormattingUndoResult,
} from "./formatting-batch";
import { isFileInFormattingFolder } from "./formatting-batch";

type BatchScope = "manual" | "folder" | "tag";

const BUILTIN_PRESET_LABELS: Record<string, string> = {
  novel: "小说整洁",
  compact: "紧凑正文",
  punctuation: "中文标点整理",
  custom: "当前自定义规则",
};

function createButton(
  parent: HTMLElement,
  text: string,
  cls?: string,
): HTMLButtonElement {
  const button = parent.createEl("button", { text, cls }) as HTMLButtonElement;
  button.type = "button";
  return button;
}

function createFilePreview(parent: HTMLElement, files: readonly TFile[]): void {
  const details = parent.createEl("details", { cls: "cw-format-file-preview" });
  details.createEl("summary", { text: "查看将处理的 " + files.length + " 篇文档" });
  const list = details.createEl("ul");
  for (const file of files) list.createEl("li", { text: file.path });
}

export class FormattingBatchModal extends Modal {
  private batchScope: BatchScope = "manual";
  private manualSearch = "";
  private selectedPaths = new Set<string>();
  private folderPath = "";
  private includeSubfolders = true;
  private tag = "";
  private scopeChipsEl?: HTMLElement;
  private scopeContentEl?: HTMLElement;
  private targetSummaryEl?: HTMLElement;
  private continueButton?: HTMLButtonElement;

  constructor(
    private plugin: ChineseWritingLayoutPlugin,
    private request: BatchFormattingRequest,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-format-batch-modal");
    this.setTitle("批量一键排版");
    this.contentEl.createDiv({
      text: "选择要处理的 Markdown 文档。执行前会再次展示方案、数量和文件列表。",
      cls: "cw-format-batch-intro",
    });

    this.scopeChipsEl = this.contentEl.createDiv({ cls: "cw-format-chip-list cw-format-batch-scope-chips" });
    this.renderScopeSelector();
    this.scopeContentEl = this.contentEl.createDiv({ cls: "cw-format-batch-scope" });
    const footer = this.contentEl.createDiv({ cls: "cw-format-footer cw-format-batch-footer" });
    this.targetSummaryEl = footer.createSpan({ cls: "cw-format-batch-target-summary" });
    const cancel = createButton(footer, "取消");
    cancel.addEventListener("click", () => this.close());
    this.continueButton = createButton(footer, "查看确认", "mod-cta");
    this.continueButton.addEventListener("click", () => this.openConfirmation());
    this.renderScope();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderScopeSelector(): void {
    const scopeChips = this.scopeChipsEl;
    if (!scopeChips) return;
    scopeChips.empty();
    for (const option of [
      { value: "manual" as const, label: "手动选择文档" },
      { value: "folder" as const, label: "按文件夹" },
      { value: "tag" as const, label: "按 Tag" },
    ]) {
      const chip = createButton(scopeChips, option.label, "cw-format-chip");
      chip.toggleClass("is-active", this.batchScope === option.value);
      chip.setAttribute("aria-pressed", String(this.batchScope === option.value));
      chip.addEventListener("click", () => {
        this.batchScope = option.value;
        this.onOpenScopeChanged();
      });
    }
  }

  private onOpenScopeChanged(): void {
    this.renderScopeSelector();
    this.renderScope();
  }

  private renderScope(): void {
    const content = this.scopeContentEl;
    if (!content) return;
    content.empty();
    if (this.batchScope === "manual") this.renderManualScope(content);
    else if (this.batchScope === "folder") this.renderFolderScope(content);
    else this.renderTagScope(content);
    this.updateTargetState();
  }

  private renderManualScope(content: HTMLElement): void {
    content.createEl("h3", { text: "手动选择文档" });
    const controls = content.createDiv({ cls: "cw-format-batch-controls" });
    const search = controls.createEl("input", {
      type: "search",
      placeholder: "搜索文件名或路径…",
      cls: "cw-format-batch-search",
    }) as HTMLInputElement;
    search.value = this.manualSearch;
    search.addEventListener("input", () => {
      this.manualSearch = search.value;
      this.renderScope();
    });
    const selectVisible = createButton(controls, "全选当前搜索结果");
    selectVisible.addEventListener("click", () => {
      for (const file of this.getManualSearchResults()) this.selectedPaths.add(file.path);
      this.renderScope();
    });
    const clear = createButton(controls, "清空选择");
    clear.addEventListener("click", () => {
      this.selectedPaths.clear();
      this.renderScope();
    });

    const files = this.getManualSearchResults();
    content.createDiv({
      text: "当前显示 " + files.length + " 篇，已选择 " + this.selectedPaths.size + " 篇。",
      cls: "cw-format-section-hint",
    });
    const list = content.createDiv({ cls: "cw-format-selectable-file-list" });
    if (files.length === 0) {
      list.createDiv({ text: "没有匹配的 Markdown 文档。", cls: "cw-format-empty-state" });
      return;
    }
    for (const file of files) {
      const label = list.createEl("label", { cls: "cw-format-selectable-file" });
      const checkbox = label.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      checkbox.checked = this.selectedPaths.has(file.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selectedPaths.add(file.path);
        else this.selectedPaths.delete(file.path);
        this.updateTargetState();
      });
      label.createSpan({ text: file.path });
    }
  }

  private renderFolderScope(content: HTMLElement): void {
    content.createEl("h3", { text: "按文件夹" });
    content.createDiv({
      text: "明确选择是否包含子文件夹；不会在后台静默扩展处理范围。",
      cls: "cw-format-section-hint",
    });
    const select = content.createEl("select", { cls: "dropdown cw-format-batch-folder-select" }) as HTMLSelectElement;
    const folders = this.plugin.app.vault.getAllFolders(true)
      .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
    for (const folder of folders) {
      select.createEl("option", {
        value: folder.path,
        text: folder.isRoot() ? "Vault 根目录" : folder.path,
      });
    }
    select.value = this.folderPath;
    select.addEventListener("change", () => {
      this.folderPath = select.value;
      this.renderScope();
    });

    const childLabel = content.createEl("label", { cls: "cw-format-folder-children-option" });
    const children = childLabel.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    children.checked = this.includeSubfolders;
    children.addEventListener("change", () => {
      this.includeSubfolders = children.checked;
      this.renderScope();
    });
    childLabel.createSpan({ text: "包含子文件夹" });

    const files = this.getTargetFiles();
    content.createDiv({
      text: "当前范围将处理 " + files.length + " 篇 Markdown 文档。",
      cls: "cw-format-section-hint",
    });
    createFilePreview(content, files);
  }

  private renderTagScope(content: HTMLElement): void {
    content.createEl("h3", { text: "按 Tag" });
    const tags = this.getAvailableTags();
    if (tags.length === 0) {
      content.createDiv({ text: "当前 Vault 中没有可用 Tag。", cls: "cw-format-empty-state" });
      return;
    }
    const select = content.createEl("select", { cls: "dropdown cw-format-batch-tag-select" }) as HTMLSelectElement;
    select.createEl("option", { value: "", text: "选择一个 Tag…" });
    for (const tag of tags) select.createEl("option", { value: tag, text: tag });
    select.value = this.tag;
    select.addEventListener("change", () => {
      this.tag = select.value;
      this.renderScope();
    });
    const files = this.getTargetFiles();
    content.createDiv({
      text: this.tag
        ? "Tag " + this.tag + " 匹配 " + files.length + " 篇 Markdown 文档。"
        : "请选择一个 Tag 后查看匹配文档。",
      cls: "cw-format-section-hint",
    });
    if (this.tag) createFilePreview(content, files);
  }

  private getMarkdownFiles(): TFile[] {
    return this.plugin.app.vault.getMarkdownFiles()
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
  }

  private getManualSearchResults(): TFile[] {
    const query = this.manualSearch.trim().toLocaleLowerCase();
    if (!query) return this.getMarkdownFiles();
    return this.getMarkdownFiles().filter((file) =>
      file.path.toLocaleLowerCase().includes(query),
    );
  }

  private getAvailableTags(): string[] {
    const tags = new Set<string>();
    for (const file of this.getMarkdownFiles()) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      for (const tag of cache ? getAllTags(cache) ?? [] : []) tags.add(tag);
    }
    return [...tags].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  private getTargetFiles(): TFile[] {
    const files = this.getMarkdownFiles();
    if (this.batchScope === "manual") return files.filter((file) => this.selectedPaths.has(file.path));
    if (this.batchScope === "folder") {
      return files.filter((file) =>
        isFileInFormattingFolder(file.path, this.folderPath, this.includeSubfolders),
      );
    }
    if (!this.tag) return [];
    return files.filter((file) => {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      return cache ? (getAllTags(cache) ?? []).includes(this.tag) : false;
    });
  }

  private updateTargetState(): void {
    const count = this.getTargetFiles().length;
    if (this.targetSummaryEl) this.targetSummaryEl.setText("已选择 " + count + " 篇");
    if (this.continueButton) this.continueButton.disabled = count === 0;
  }

  private openConfirmation(): void {
    const files = this.getTargetFiles();
    if (files.length === 0) {
      new Notice("请先选择至少一篇 Markdown 文档");
      return;
    }
    this.close();
    new BatchFormattingConfirmationModal(this.plugin, this.request, files).open();
  }
}

class BatchFormattingConfirmationModal extends Modal {
  constructor(
    private plugin: ChineseWritingLayoutPlugin,
    private request: BatchFormattingRequest,
    private files: TFile[],
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-format-batch-confirm-modal");
    this.setTitle("确认批量排版");
    const info = this.contentEl.createDiv({ cls: "cw-format-batch-confirm-info" });
    info.createDiv({ text: "排版方案：" + this.getPresetLabel() });
    info.createDiv({ text: "将处理：" + this.files.length + " 篇 Markdown 文档" });
    info.createDiv({
      text: "处理会直接修改这些文件；完成后只能撤回最近一次批量排版。",
      cls: "cw-format-section-hint",
    });
    createFilePreview(this.contentEl, this.files);

    const footer = this.contentEl.createDiv({ cls: "cw-format-footer" });
    const cancel = createButton(footer, "取消");
    cancel.addEventListener("click", () => this.close());
    const confirm = createButton(footer, "开始批量排版", "mod-cta");
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      confirm.setText("正在处理…");
      void this.plugin.applyBatchFormatting(this.request, this.files)
        .then((result) => {
          this.close();
          new BatchFormattingResultModal(this.plugin, result).open();
        })
        .catch((error: unknown) => {
          confirm.disabled = false;
          confirm.setText("开始批量排版");
          new Notice("批量排版失败：" + (error instanceof Error ? error.message : "未知错误"));
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private getPresetLabel(): string {
    if (BUILTIN_PRESET_LABELS[this.request.preset]) return BUILTIN_PRESET_LABELS[this.request.preset];
    if (!this.request.preset.startsWith("saved:")) return "当前自定义规则";
    const id = this.request.preset.slice("saved:".length);
    return this.plugin.settings.customFormattingPresets.find((item) => item.id === id)?.name
      ?? "已保存自定义方案";
  }
}

class BatchFormattingResultModal extends Modal {
  constructor(
    private plugin: ChineseWritingLayoutPlugin,
    private result: BatchFormattingResult,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("cw-format-batch-result-modal");
    this.setTitle("批量排版完成");
    this.contentEl.createEl("p", {
      text: "批量排版完成：已处理 " + this.result.processed + " 篇文档，其中 "
        + this.result.changed + " 篇有修改。",
    });
    if (this.result.failedPaths.length > 0) {
      this.contentEl.createDiv({
        text: this.result.failedPaths.length + " 篇文档未能处理，可展开查看。",
        cls: "cw-format-section-hint",
      });
      const details = this.contentEl.createEl("details", { cls: "cw-format-file-preview" });
      details.createEl("summary", { text: "查看未处理文档" });
      const list = details.createEl("ul");
      for (const path of this.result.failedPaths) list.createEl("li", { text: path });
    }

    const footer = this.contentEl.createDiv({ cls: "cw-format-footer" });
    const close = createButton(footer, "关闭");
    close.addEventListener("click", () => this.close());
    if (this.result.changed === 0) return;
    const undo = createButton(footer, "撤回本次排版", "mod-warning");
    undo.addEventListener("click", () => {
      undo.disabled = true;
      void this.plugin.undoLastBatchFormatting().then((undoResult) => {
        this.renderUndoResult(undoResult);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderUndoResult(result: BatchFormattingUndoResult): void {
    this.contentEl.empty();
    this.setTitle("已执行撤回");
    this.contentEl.createEl("p", {
      text: "已撤回 " + result.restored + " 篇文档。"
        + (result.skipped ? "另有 " + result.skipped + " 篇因之后被修改或不存在而未覆盖。" : ""),
    });
    const footer = this.contentEl.createDiv({ cls: "cw-format-footer" });
    const close = createButton(footer, "关闭", "mod-cta");
    close.addEventListener("click", () => this.close());
  }
}
