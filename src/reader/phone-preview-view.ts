import { Component, ItemView, MarkdownView, setIcon, type WorkspaceLeaf } from "obsidian";
import { countCreativeWords } from "../text-analysis";
import { syncReadingProseLines } from "../reading-view-lines";
import { renderReaderMarkdown, waitForReaderAssets } from "./reader-renderer";
import { phonePreviewScale, scrollProgress, scrollTarget } from "./phone-preview-layout";

export const PHONE_PREVIEW_VIEW_TYPE = "chinese-writing-phone-preview";

const DEVICES = {
  default: { label: "默认手机 · 390 × 780", width: 390, height: 780 },
  compact: { label: "小屏手机 · 360 × 720", width: 360, height: 720 },
  large: { label: "大屏手机 · 430 × 860", width: 430, height: 860 },
};

export class PhonePreviewView extends ItemView {
  private source: MarkdownView | null = null;
  private stage!: HTMLElement;
  private fit!: HTMLElement;
  private device!: HTMLElement;
  private scroll!: HTMLElement;
  private article!: HTMLElement;
  private meta!: HTMLElement;
  private footer!: HTMLElement;
  private deviceKey: keyof typeof DEVICES = "default";
  private syncEnabled = true;
  private renderTimer?: number;
  private generation = 0;
  private rendered?: Component;
  private pending = new Set<Component>();
  private observer?: ResizeObserver;
  private sourceScroll?: HTMLElement;
  private ignorePreviewTop?: number;
  private ignoreSourceTop?: number;
  private sourcePath?: string;
  private ready = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.icon = "smartphone";
  }

  getViewType(): string { return PHONE_PREVIEW_VIEW_TYPE; }
  getDisplayText(): string { return "手机预览"; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("cw-phone-preview");
    const header = this.contentEl.createDiv({ cls: "cw-phone-header" });
    header.createEl("h2", { text: "手机预览" });
    const close = header.createEl("button", { attr: { "aria-label": "关闭手机预览", type: "button" } });
    setIcon(close, "x");
    this.registerDomEvent(close, "click", () => this.leaf.detach());
    this.stage = this.contentEl.createDiv({ cls: "cw-phone-stage" });
    this.fit = this.stage.createDiv({ cls: "cw-phone-fit" });
    this.device = this.fit.createDiv({ cls: "cw-phone-device", attr: { "data-theme": "white" } });
    this.meta = this.device.createDiv({ cls: "cw-phone-meta" });
    this.scroll = this.device.createDiv({ cls: "cw-phone-scroll", attr: { tabindex: "0", "aria-label": "手机阅读正文" } });
    this.article = this.scroll.createDiv({ cls: "cw-phone-article markdown-rendered" });
    this.footer = this.device.createDiv({ cls: "cw-phone-footer" });
    const controls = this.contentEl.createDiv({ cls: "cw-phone-controls" });
    this.addSelect(controls, "预览样式", { white: "默认样式", warm: "暖纸", dark: "夜间" }, "white", (value) => {
      this.device.dataset.theme = value;
    });
    this.addSelect(controls, "预览字号", { "16": "16 px", "18": "18 px", "20": "20 px", "22": "22 px", "24": "24 px" }, "20", (value) => {
      const progress = this.previewProgress();
      this.device.style.setProperty("--cw-phone-font-size", `${value}px`);
      this.setPreviewProgress(progress);
    });
    this.addSelect(controls, "机型选择", Object.fromEntries(Object.entries(DEVICES).map(([key, value]) => [key, value.label])), "default", (value) => {
      const progress = this.previewProgress();
      this.deviceKey = value as keyof typeof DEVICES;
      this.resize();
      this.setPreviewProgress(progress);
    });
    this.addSelect(controls, "同步滚动", { on: "开启 ⇄", off: "关闭" }, "on", (value) => {
      this.syncEnabled = value === "on";
      if (this.syncEnabled) this.syncFromSource();
    });
    this.registerDomEvent(this.scroll, "scroll", () => this.syncToSource(), { passive: true });
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) this.setSource(leaf.view);
    }));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) this.setSource(view);
    }));
    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
      if (info === this.source) this.scheduleRender();
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file === this.source?.file) this.scheduleRender();
    }));
    this.registerEvent(this.app.vault.on("rename", (file) => {
      if (file === this.source?.file) this.setSource(this.source);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file === this.source?.file) this.setSource(null);
    }));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.stage);
    this.ready = true;
    this.resize();
    this.setSource(this.source ?? this.app.workspace.getActiveViewOfType(MarkdownView));
  }

  setSource(view: MarkdownView | null): void {
    const changed = view !== this.source || view?.file?.path !== this.sourcePath;
    this.source = view;
    this.sourcePath = view?.file?.path;
    if (!this.ready) return;
    this.unbindSourceScroll();
    // Capture scroll events on the view so switching between editor and reading mode also works.
    if (view) {
      this.sourceScroll = view.contentEl;
      this.sourceScroll.addEventListener("scroll", this.onSourceScroll, true);
    }
    if (changed) this.setPreviewProgress(0);
    this.scheduleRender(0);
  }

  private addSelect(root: HTMLElement, label: string, options: Record<string, string>, initial: string, change: (value: string) => void): void {
    const wrapper = root.createEl("label");
    const select = wrapper.createEl("select", { attr: { "aria-label": label } });
    for (const [value, text] of Object.entries(options)) select.createEl("option", { value, text });
    select.value = initial;
    wrapper.createSpan({ text: label });
    this.registerDomEvent(select, "change", () => change(select.value));
  }

  private resize(): void {
    const { width, height } = DEVICES[this.deviceKey];
    const scale = phonePreviewScale(width, height, Math.max(0, this.stage.clientWidth - 24), Math.max(0, this.stage.clientHeight - 24));
    this.device.style.width = `${width}px`;
    this.device.style.height = `${height}px`;
    this.device.style.transform = `scale(${scale})`;
    this.fit.style.width = `${width * scale}px`;
    this.fit.style.height = `${height * scale}px`;
  }

  private scheduleRender(delay = 350): void {
    this.generation++;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      void this.renderArticle();
    }, delay);
  }

  private async renderArticle(): Promise<void> {
    const generation = this.generation;
    const view = this.source;
    const file = view?.file;
    if (!file) {
      this.rendered?.unload();
      this.rendered = undefined;
      this.article.empty();
      this.article.createEl("p", { text: "打开一篇 Markdown 笔记，即可预览手机阅读效果。" });
      this.meta.setText("章节预览");
      this.footer.setText("");
      return;
    }
    const component = new Component();
    component.load();
    this.pending.add(component);
    // Render offscreen, then commit only the latest version, keeping the old article readable.
    const next = this.article.ownerDocument.createElement("div");
    next.className = "cw-phone-article markdown-rendered";
    try {
      const markdown = view.editor?.getValue() ?? await this.app.vault.cachedRead(file);
      await renderReaderMarkdown(this.app, markdown, next, file.path, component);
      if (!this.ready || generation !== this.generation) return;
      syncReadingProseLines(next, true);
      const first = next.firstElementChild;
      const heading = first?.matches("h1") ? first : first?.querySelector("h1");
      if (heading?.textContent?.trim() !== file.basename) {
        const title = next.ownerDocument.createElement("h1");
        title.textContent = file.basename;
        next.prepend(title);
      }
      const progress = this.previewProgress();
      this.rendered?.unload();
      this.rendered = component;
      this.pending.delete(component);
      this.article.replaceWith(next);
      this.article = next;
      this.meta.setText(`${file.parent?.name || "章节预览"} / ${file.basename}`);
      this.footer.setText(`本章：${countCreativeWords(markdown)} 字`);
      this.setPreviewProgress(progress);
      await waitForReaderAssets(next);
      if (!this.ready || generation !== this.generation) return;
      this.setPreviewProgress(progress);
      if (this.syncEnabled) this.syncFromSource();
    } catch (error) {
      if (this.ready && generation === this.generation) this.footer.setText("预览失败，请重新打开手机预览。");
      console.error("中文写作排版：手机预览失败", error);
    } finally {
      if (this.pending.delete(component)) component.unload();
    }
  }

  private previewProgress(): number {
    return scrollProgress(this.scroll.scrollTop, this.scroll.scrollHeight, this.scroll.clientHeight);
  }

  private setPreviewProgress(progress: number): void {
    this.scroll.scrollTop = scrollTarget(progress, this.scroll.scrollHeight, this.scroll.clientHeight);
    this.ignorePreviewTop = this.scroll.scrollTop;
  }

  private getSourceScroller(): HTMLElement | null {
    if (!this.source) return null;
    return this.source.contentEl.querySelector<HTMLElement>(this.source.getMode() === "source" ? ".cm-scroller" : ".markdown-preview-view");
  }

  private readonly onSourceScroll = (event: Event): void => {
    const source = this.getSourceScroller();
    if (event.target !== source || !source) return;
    if (this.ignoreSourceTop !== undefined && Math.abs(source.scrollTop - this.ignoreSourceTop) < 1) {
      this.ignoreSourceTop = undefined;
      return;
    }
    this.ignoreSourceTop = undefined;
    this.syncFromSource();
  };

  private syncFromSource(): void {
    if (!this.syncEnabled) return;
    const source = this.getSourceScroller();
    if (source) this.setPreviewProgress(scrollProgress(source.scrollTop, source.scrollHeight, source.clientHeight));
  }

  private syncToSource(): void {
    if (this.ignorePreviewTop !== undefined && Math.abs(this.scroll.scrollTop - this.ignorePreviewTop) < 1) {
      this.ignorePreviewTop = undefined;
      return;
    }
    this.ignorePreviewTop = undefined;
    if (!this.syncEnabled) return;
    const source = this.getSourceScroller();
    if (!source) return;
    source.scrollTop = scrollTarget(this.previewProgress(), source.scrollHeight, source.clientHeight);
    this.ignoreSourceTop = source.scrollTop;
  }

  private unbindSourceScroll(): void {
    this.sourceScroll?.removeEventListener("scroll", this.onSourceScroll, true);
    this.sourceScroll = undefined;
    this.ignoreSourceTop = undefined;
  }

  async onClose(): Promise<void> {
    this.ready = false;
    this.generation++;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.observer?.disconnect();
    this.unbindSourceScroll();
    this.rendered?.unload();
    for (const component of this.pending) component.unload();
    this.pending.clear();
    this.source = null;
    this.contentEl.empty();
  }
}
