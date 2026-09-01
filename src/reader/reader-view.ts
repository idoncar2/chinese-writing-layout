import {
  Component,
  FileView,
  MarkdownRenderer,
  Platform,
  setIcon,
  TFile,
  type App,
  type MarkdownView,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { fontSelectionToLegacyFontFamily } from "../font-selection";
import type { ReaderPosition, ReaderSettings, ReaderMode } from "../types";
import {
  READER_PHONE_BASE_HEIGHT,
  READER_PHONE_BASE_WIDTH,
  READER_PHONE_PAGE_GAP,
  READER_VIEW_TYPE,
  normalizeReaderViewState,
} from "./reader-constants";
import { waitForReaderAssets, renderReaderMarkdown } from "./reader-renderer";
import { resolveReaderSource } from "./reader-source";
import {
  calculateReaderPageCount,
  calculateReaderPageOffset,
  clampReaderPage,
  readerPageFromProgress,
  readerProgressFromPage,
} from "./reader-pagination";
import {
  createReaderBlockDescriptors,
  getReaderBlockElements,
  resolveReaderBlockIndex,
} from "./reader-position";

export interface ReaderViewHost {
  app: App;
  getReaderSourceView(file: TFile): MarkdownView | null;
  getReaderSettings(): ReaderSettings;
  getReaderPosition(path: string): ReaderPosition | undefined;
  saveReaderPosition(path: string, position: ReaderPosition): Promise<void>;
  openReaderSettings(view: ReaderView): void;
  openReader(mode: ReaderMode): Promise<void>;
  exitReader(view: ReaderView): Promise<void>;
}

export class ReaderView extends FileView {
  allowNoFile = false;
  navigation = true;

  private readonly host: ReaderViewHost;
  private mode: ReaderMode = "desktop";
  private sourceLeaf?: WorkspaceLeaf;
  private shellReady = false;
  private readerScrollEl?: HTMLElement;
  private readerContentEl?: HTMLElement;
  private readerTitleEl?: HTMLElement;
  private readerModeLabelEl?: HTMLElement;
  private readerFooterEl?: HTMLElement;
  private renderComponent?: Component;
  private renderGeneration = 0;
  private currentPage = 1;
  private totalPages = 1;
  private phonePageWidth = READER_PHONE_BASE_WIDTH;
  private phonePageGap = READER_PHONE_PAGE_GAP;
  private phoneMeasurementTimer?: number;
  private positionSaveTimer?: number;
  private wheelAccumulator = 0;
  private resizeObserver?: ResizeObserver;

  constructor(leaf: WorkspaceLeaf, host: ReaderViewHost) {
    super(leaf);
    this.host = host;
    this.icon = "book-open";
  }

  getViewType(): string {
    return READER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "阅读模式";
  }

  getState(): Record<string, unknown> {
    return {
      file: this.file?.path ?? "",
      mode: this.mode,
    };
  }

  async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    const next = normalizeReaderViewState(state);
    this.mode = next.mode;
    if (!next.file) {
      if (this.file) await this.onUnloadFile(this.file);
      this.file = null;
      this.renderEmptyState("没有可阅读的 Markdown 笔记。");
      this.updateModeClasses();
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(next.file);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      if (this.file) await this.onUnloadFile(this.file);
      this.file = null;
      this.renderEmptyState("找不到要阅读的 Markdown 笔记。");
      return;
    }

    if (this.file?.path !== file.path) {
      if (this.file) await this.onUnloadFile(this.file);
      this.file = file;
    } else {
      this.file = file;
    }
    await this.onLoadFile(file);
    this.updateModeClasses();
  }

  canAcceptExtension(extension: string): boolean {
    return extension.toLowerCase() === "md";
  }

  setSourceLeaf(leaf: WorkspaceLeaf | undefined): void {
    this.sourceLeaf = leaf;
  }

  getSourceLeaf(): WorkspaceLeaf | undefined {
    return this.sourceLeaf;
  }

  refreshContent(): void {
    if (!this.shellReady) return;
    this.applyReaderSettings();
    this.updateModeClasses();
    this.schedulePhoneMeasurement();
    this.updateReaderProgress();
  }

  protected async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("cw-reader-view");
    this.renderShell();
    this.applyReaderSettings();
    this.updateModeClasses();
    if (this.file) await this.renderCurrentFile();
  }

  protected async onClose(): Promise<void> {
    await this.saveCurrentPosition();
    this.renderGeneration += 1;
    this.disposeRenderComponent();
    this.clearTimers();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.sourceLeaf = undefined;
    this.shellReady = false;
    this.contentEl.empty();
    this.contentEl.removeClass("cw-reader-view");
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
    this.updateReaderTitle();
    await this.renderCurrentFile();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    if (this.file?.path === file.path) await this.saveCurrentPosition();
    this.renderGeneration += 1;
    this.disposeRenderComponent();
    if (this.file?.path === file.path) {
      this.file = null;
      this.readerContentEl?.empty();
    }
  }

  async onRename(file: TFile): Promise<void> {
    this.file = file;
    this.updateReaderTitle();
    await this.renderCurrentFile();
  }

  async saveCurrentPosition(): Promise<void> {
    if (this.positionSaveTimer !== undefined) {
      window.clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = undefined;
    }
    if (!this.file || !this.readerScrollEl) return;
    await this.host.saveReaderPosition(this.file.path, {
      anchor: this.captureReaderAnchor(),
      updatedAt: Date.now(),
    });
  }

  private renderShell(): void {
    if (this.shellReady) return;
    this.shellReady = true;

    const header = this.contentEl.createDiv({ cls: "cw-reader-header" });
    const backButton = this.createActionButton(
      header,
      "arrow-left",
      "返回",
      "返回编辑页",
      () => void this.host.exitReader(this),
    );
    backButton.classList.add("cw-reader-back-button");

    this.readerTitleEl = header.createEl("h2", {
      cls: "cw-reader-title",
      text: this.getDisplayText(),
    });

    const actions = header.createDiv({ cls: "cw-reader-header-actions" });
    const modeButton = this.createActionButton(
      actions,
      "smartphone",
      "手机预览",
      "切换阅读方式",
      () => void this.host.openReader(this.isPhonePreview() ? "desktop" : "phone"),
    );
    modeButton.classList.add("cw-reader-mode-button");
    this.readerModeLabelEl = modeButton.createSpan({
      cls: "cw-reader-action-label",
      text: "手机预览",
    });

    this.createActionButton(
      actions,
      "settings",
      "阅读设置",
      "打开阅读设置",
      () => this.host.openReaderSettings(this),
    ).classList.add("cw-reader-settings-button");

    this.readerScrollEl = this.contentEl.createDiv({
      cls: "cw-reader-scroll",
      attr: {
        tabindex: "0",
        "aria-label": "阅读正文",
      },
    });
    this.readerContentEl = this.readerScrollEl.createDiv({ cls: "cw-reader-content" });
    this.readerFooterEl = this.contentEl.createDiv({
      cls: "cw-reader-footer",
      attr: { "aria-live": "polite" },
    });

    this.registerDomEvent(this.contentEl, "keydown", (event) => this.handleKeydown(event));
    this.registerDomEvent(this.readerScrollEl, "scroll", () => this.handleScroll());
    this.registerDomEvent(this.readerScrollEl, "click", (event) => this.handleClick(event));
    this.registerDomEvent(this.readerScrollEl, "wheel", (event) => this.handleWheel(event), {
      passive: false,
    });

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.schedulePhoneMeasurement());
      this.resizeObserver.observe(this.readerScrollEl);
    }
  }

  private createActionButton(
    root: HTMLElement,
    icon: string,
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = root.createEl("button", {
      cls: "cw-reader-action",
      attr: {
        type: "button",
        title,
        "aria-label": title,
      },
    });
    setIcon(button, icon);
    button.createSpan({ cls: "cw-reader-action-label", text: label });
    button.addEventListener("click", onClick);
    return button;
  }

  private async renderCurrentFile(): Promise<void> {
    const target = this.readerContentEl;
    const file = this.file;
    if (!target || !file) return;

    const generation = ++this.renderGeneration;
    const savedPosition = this.host.getReaderPosition(file.path);
    const sourceView = this.host.getReaderSourceView(file);
    let markdown: string;
    try {
      markdown = await resolveReaderSource(
        file.path,
        sourceView,
        () => this.app.vault.cachedRead(file),
      );
    } catch (error) {
      if (generation !== this.renderGeneration) return;
      console.error("中文写作排版：阅读模式读取正文失败", error);
      target.empty();
      target.createEl("p", { text: "暂时无法读取这篇笔记。", cls: "cw-reader-error" });
      return;
    }
    if (generation !== this.renderGeneration) return;

    this.disposeRenderComponent();
    target.empty();
    const component = new Component();
    component.load();
    this.renderComponent = component;
    try {
      // Keep the renderer explicit here as well as in reader-renderer.ts: the
      // view is an Obsidian MarkdownRenderer consumer, not a custom Markdown parser.
      void MarkdownRenderer;
      await renderReaderMarkdown(this.app, markdown, target, file.path, component);
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForReaderAssets(target);
    } catch (error) {
      if (generation !== this.renderGeneration) return;
      console.error("中文写作排版：阅读模式渲染正文失败", error);
      this.disposeRenderComponent();
      target.empty();
      target.createEl("p", { text: "暂时无法渲染这篇笔记。", cls: "cw-reader-error" });
      return;
    }
    if (generation !== this.renderGeneration) return;

    this.applyReaderSettings();
    this.updateModeClasses();
    this.measurePhonePreview();
    this.restoreReaderPosition(savedPosition);
    this.updateReaderTitle();
    this.updateReaderProgress();
  }

  private disposeRenderComponent(): void {
    this.renderComponent?.unload();
    this.renderComponent = undefined;
  }

  private applyReaderSettings(): void {
    const settings = this.host.getReaderSettings();
    this.contentEl.style.setProperty(
      "--cw-reader-font-family",
      fontSelectionToLegacyFontFamily(settings.font, "body"),
    );
    this.contentEl.style.setProperty("--cw-reader-font-size", `${settings.fontSize}px`);
    this.contentEl.style.setProperty("--cw-reader-line-height", `${settings.lineHeight}`);
    this.contentEl.style.setProperty(
      "--cw-reader-paragraph-spacing",
      `${settings.paragraphSpacing}em`,
    );
    this.contentEl.style.setProperty("--cw-reader-content-width", `${settings.contentWidth}px`);
    this.contentEl.style.setProperty("--cw-reader-page-padding", `${settings.pagePadding}px`);
    this.contentEl.style.setProperty("--cw-reader-background", "var(--background-primary)");
    for (const background of ["white", "warm", "gray", "dark"] as const) {
      this.contentEl.removeClass(`cw-reader-background-${background}`);
    }
    this.contentEl.addClass(`cw-reader-background-${settings.background}`);
  }

  private updateModeClasses(): void {
    const phone = this.isPhonePreview();
    this.contentEl.toggleClass("cw-reader-phone", phone);
    this.contentEl.toggleClass("cw-reader-desktop", !phone);
    this.contentEl.toggleClass("cw-reader-native-mobile", Platform.isMobileApp);
    if (this.readerModeLabelEl) {
      this.readerModeLabelEl.setText(phone ? "桌面阅读" : "手机预览");
    }
    if (this.readerFooterEl && !phone) {
      this.readerFooterEl.setAttribute("aria-label", "阅读进度");
    }
    this.schedulePhoneMeasurement();
  }

  private isPhonePreview(): boolean {
    return this.mode === "phone" && !Platform.isMobileApp;
  }

  private measurePhonePreview(): void {
    const scroll = this.readerScrollEl;
    const content = this.readerContentEl;
    if (!scroll || !content || !this.isPhonePreview()) {
      this.currentPage = 1;
      this.totalPages = 1;
      if (scroll) scroll.scrollLeft = 0;
      return;
    }

    const previousProgress = readerProgressFromPage(this.currentPage, this.totalPages);
    const settings = this.host.getReaderSettings();
    const availableWidth = Math.max(280, scroll.clientWidth - 24);
    const pageWidth = Math.min(READER_PHONE_BASE_WIDTH, availableWidth);
    const pageHeight = Math.min(
      READER_PHONE_BASE_HEIGHT,
      Math.max(480, scroll.clientHeight - 24 || READER_PHONE_BASE_HEIGHT),
    );
    const pageContentWidth = Math.max(220, pageWidth - settings.pagePadding * 2);
    const pageContentHeight = Math.max(360, pageHeight - settings.pagePadding * 2);
    this.phonePageWidth = pageWidth;
    this.phonePageGap = READER_PHONE_PAGE_GAP;
    content.style.setProperty("--cw-reader-page-width", `${pageWidth}px`);
    content.style.setProperty("--cw-reader-page-height", `${pageHeight}px`);
    content.style.setProperty("--cw-reader-page-content-width", `${pageContentWidth}px`);
    content.style.setProperty("--cw-reader-page-content-height", `${pageContentHeight}px`);
    this.totalPages = calculateReaderPageCount(
      content.scrollWidth,
      pageWidth,
      this.phonePageGap,
    );
    this.currentPage = readerPageFromProgress(previousProgress, this.totalPages);
    this.scrollToCurrentPhonePage();
  }

  private schedulePhoneMeasurement(): void {
    if (!this.shellReady) return;
    if (this.phoneMeasurementTimer !== undefined) {
      window.clearTimeout(this.phoneMeasurementTimer);
    }
    this.phoneMeasurementTimer = window.setTimeout(() => {
      this.phoneMeasurementTimer = undefined;
      this.measurePhonePreview();
      this.updateReaderProgress();
    }, 60);
  }

  private scrollToCurrentPhonePage(): void {
    if (!this.readerScrollEl || !this.isPhonePreview()) return;
    const left = calculateReaderPageOffset(
      this.currentPage,
      this.phonePageWidth,
      this.phonePageGap,
    );
    if (typeof this.readerScrollEl.scrollTo === "function") {
      this.readerScrollEl.scrollTo({ left, behavior: "auto" });
    } else {
      this.readerScrollEl.scrollLeft = left;
    }
  }

  private goToPage(delta: number): void {
    if (!this.isPhonePreview()) return;
    this.currentPage = clampReaderPage(this.currentPage + delta, this.totalPages);
    this.scrollToCurrentPhonePage();
    this.updateReaderProgress();
    this.scheduleReaderPositionSave();
  }

  private handleScroll(): void {
    if (!this.readerScrollEl) return;
    if (this.isPhonePreview()) {
      const page = Math.round(
        this.readerScrollEl.scrollLeft / (this.phonePageWidth + this.phonePageGap),
      ) + 1;
      this.currentPage = clampReaderPage(page, this.totalPages);
    }
    this.updateReaderProgress();
    this.scheduleReaderPositionSave();
  }

  private handleClick(event: MouseEvent): void {
    if (!this.isPhonePreview() || !this.readerScrollEl) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a, button, input, select, textarea")) return;
    const rect = this.readerScrollEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const position = event.clientX - rect.left;
    if (position < rect.width * 0.25) this.goToPage(-1);
    else if (position > rect.width * 0.75) this.goToPage(1);
  }

  private handleWheel(event: WheelEvent): void {
    if (!this.isPhonePreview()) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a, button, input, select, textarea")) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
    this.wheelAccumulator += delta;
    if (Math.abs(this.wheelAccumulator) < 80) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const direction = this.wheelAccumulator > 0 ? 1 : -1;
    this.wheelAccumulator = 0;
    this.goToPage(direction);
  }

  private handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement
      && target.closest("input, textarea, select, button, a, [contenteditable='true']")) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      void this.host.exitReader(this);
      return;
    }
    if (!this.isPhonePreview()) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.goToPage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this.goToPage(1);
    }
  }

  private restoreReaderPosition(position: ReaderPosition | undefined): void {
    if (!position || !this.readerScrollEl || !this.readerContentEl) {
      if (this.isPhonePreview()) {
        this.currentPage = 1;
        this.scrollToCurrentPhonePage();
      } else {
        this.readerScrollEl && (this.readerScrollEl.scrollTop = 0);
      }
      return;
    }
    if (this.isPhonePreview()) {
      this.currentPage = readerPageFromProgress(
        position.anchor.documentProgress,
        this.totalPages,
      );
      this.scrollToCurrentPhonePage();
      return;
    }

    const elements = getReaderBlockElements(this.readerContentEl);
    const descriptors = createReaderBlockDescriptors(elements);
    const index = resolveReaderBlockIndex(descriptors, position.anchor);
    const element = elements[index];
    if (element) {
      const containerRect = this.readerScrollEl.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      this.readerScrollEl.scrollTop = Math.max(
        0,
        this.readerScrollEl.scrollTop + elementRect.top - containerRect.top - 20,
      );
      return;
    }
    const maxScroll = Math.max(
      0,
      this.readerScrollEl.scrollHeight - this.readerScrollEl.clientHeight,
    );
    this.readerScrollEl.scrollTop = maxScroll * position.anchor.documentProgress;
  }

  private captureReaderAnchor(): ReaderPosition["anchor"] {
    const scroll = this.readerScrollEl;
    const content = this.readerContentEl;
    const elements = content ? getReaderBlockElements(content) : [];
    const descriptors = createReaderBlockDescriptors(elements);
    let blockIndex = 0;
    if (scroll && elements.length > 0) {
      const top = scroll.getBoundingClientRect().top + 12;
      const visible = elements.findIndex((element) => element.getBoundingClientRect().bottom >= top);
      blockIndex = visible >= 0 ? visible : elements.length - 1;
    }
    const descriptor = descriptors[blockIndex];
    const progress = this.isPhonePreview()
      ? readerProgressFromPage(this.currentPage, this.totalPages)
      : scroll && scroll.scrollHeight > scroll.clientHeight
        ? Math.min(1, Math.max(0, scroll.scrollTop / (scroll.scrollHeight - scroll.clientHeight)))
        : 0;
    return {
      blockIndex,
      ...(descriptor ? { blockHash: descriptor.hash } : {}),
      textOffset: 0,
      documentProgress: progress,
    };
  }

  private scheduleReaderPositionSave(): void {
    if (this.positionSaveTimer !== undefined) window.clearTimeout(this.positionSaveTimer);
    this.positionSaveTimer = window.setTimeout(() => {
      this.positionSaveTimer = undefined;
      void this.saveCurrentPosition();
    }, 500);
  }

  private updateReaderTitle(): void {
    if (this.readerTitleEl) this.readerTitleEl.setText(this.getDisplayText());
  }

  private updateReaderProgress(): void {
    if (!this.readerFooterEl) return;
    if (this.isPhonePreview()) {
      this.readerFooterEl.setText(`${this.currentPage} / ${this.totalPages}`);
      return;
    }
    const scroll = this.readerScrollEl;
    const progress = scroll && scroll.scrollHeight > scroll.clientHeight
      ? scroll.scrollTop / (scroll.scrollHeight - scroll.clientHeight)
      : 0;
    this.readerFooterEl.setText(`阅读进度 ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`);
  }

  private renderEmptyState(message: string): void {
    if (!this.readerContentEl) return;
    this.disposeRenderComponent();
    this.readerContentEl.empty();
    this.readerContentEl.createEl("p", { text: message, cls: "cw-reader-empty" });
    this.updateReaderTitle();
    this.updateReaderProgress();
  }

  private clearTimers(): void {
    if (this.phoneMeasurementTimer !== undefined) {
      window.clearTimeout(this.phoneMeasurementTimer);
      this.phoneMeasurementTimer = undefined;
    }
    if (this.positionSaveTimer !== undefined) {
      window.clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = undefined;
    }
  }
}
