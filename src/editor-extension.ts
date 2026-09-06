import { type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  analyzeChineseText,
  type DiagnosticKind,
  isProseLine,
} from "./text-analysis";
import { normalizeTypewriterCursorPosition } from "./types";
import { createQuoteInputExtension } from "./quote-input";

const SCROLL_BOTTOM_VISIBILITY_THRESHOLD = 40;
type EditorIconSetter = (element: HTMLElement, iconId: string) => void;

function createFallbackEditorIcon(element: HTMLElement): void {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const arrow = document.createElementNS(namespace, "path");
  arrow.setAttribute("d", "M12 3v14m-5-5 5 5 5-5M5 21h14");
  svg.appendChild(arrow);
  element.appendChild(svg);
}

const diagnosticClasses: Record<DiagnosticKind, string> = {
  "halfwidth-punctuation": "cw-diagnostic-halfwidth",
  "repeated-punctuation": "cw-diagnostic-repeated",
  "unmatched-pair": "cw-diagnostic-unmatched",
  "raw-indentation": "cw-diagnostic-indentation",
};

export function calculateTypewriterScrollDelta(
  caretTop: number,
  viewportTop: number,
  viewportHeight: number,
  positionPercent: number,
): number {
  const position = normalizeTypewriterCursorPosition(positionPercent) / 100;
  return caretTop - (viewportTop + viewportHeight * position);
}

export function shouldShowScrollToBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = SCROLL_BOTTOM_VISIBILITY_THRESHOLD,
): boolean {
  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  return maximumScrollTop > 1 && maximumScrollTop - scrollTop > threshold;
}

export function getScrollToBottomBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

function intersectsVisibleRange(
  from: number,
  to: number,
  view: EditorView,
): boolean {
  return view.visibleRanges.some(
    (range) => to >= range.from && from <= range.to,
  );
}

function buildDecorations(view: EditorView): DecorationSet {
  const document = view.state.doc;
  const text = document.toString();
  const decorations = [];
  let inFence = false;
  let inFrontmatter = document.line(1).text.trim() === "---";
  let previousWasProse = false;
  const activeLineNumber = document.lineAt(view.state.selection.main.head).number;

  for (let lineNumber = 1; lineNumber <= document.lines; lineNumber += 1) {
    const line = document.line(lineNumber);
    const trimmed = line.text.trim();
    const fenceLine = /^(```+|~~~+)/.test(trimmed);
    const frontmatterLine = inFrontmatter;
    const protectedLine = inFence || fenceLine || frontmatterLine;
    const proseLine = isProseLine(line.text, protectedLine);
    const emptyActiveProseLine =
      lineNumber === activeLineNumber &&
      trimmed === "" &&
      !protectedLine &&
      previousWasProse;

    if (
      intersectsVisibleRange(line.from, line.to, view) &&
      (proseLine || emptyActiveProseLine)
    ) {
      decorations.push(
        Decoration.line({
          attributes: {
            class: emptyActiveProseLine
              ? "cw-prose-line cw-empty-prose-line"
              : "cw-prose-line",
          },
        }).range(line.from),
      );
    }

    if (frontmatterLine && lineNumber > 1 && trimmed === "---") {
      inFrontmatter = false;
    }
    if (fenceLine) inFence = !inFence;
    previousWasProse = proseLine;
  }

  for (const diagnostic of analyzeChineseText(text)) {
    if (!intersectsVisibleRange(diagnostic.from, diagnostic.to, view)) continue;
    decorations.push(
      Decoration.mark({
        class: `cw-diagnostic ${diagnosticClasses[diagnostic.kind]}`,
        attributes: {
          title: diagnostic.message,
          "aria-label": diagnostic.message,
        },
      }).range(diagnostic.from, diagnostic.to),
    );
  }

  return Decoration.set(decorations, true);
}

class ChineseWritingViewPlugin implements PluginValue {
  decorations: DecorationSet;
  private centerFrame?: number;
  private scrollBottomFrame?: number;
  private readonly positionChangeListener: () => void;
  private readonly scrollBottomButton: HTMLButtonElement;
  private readonly scrollBottomClickListener: () => void;
  private readonly scrollBottomPointerListener: (event: PointerEvent) => void;
  private readonly scrollListener: () => void;
  private readonly view: EditorView;

  constructor(view: EditorView, setEditorIcon: EditorIconSetter) {
    this.view = view;
    this.positionChangeListener = () => this.scheduleTypewriterCenter(this.view, true);
    document.addEventListener(
      "cw-typewriter-position-change",
      this.positionChangeListener,
    );
    this.scrollBottomButton = document.createElement("button");
    this.scrollBottomButton.type = "button";
    this.scrollBottomButton.className = "cw-editor-scroll-bottom";
    this.scrollBottomButton.setAttribute("aria-label", "滚动到正文底部");
    this.scrollBottomButton.setAttribute("aria-hidden", "true");
    this.scrollBottomButton.tabIndex = -1;
    setEditorIcon(this.scrollBottomButton, "arrow-down-to-line");
    this.scrollListener = () => this.scheduleScrollBottomUpdate();
    this.scrollBottomClickListener = () => this.scrollToBottom();
    this.scrollBottomPointerListener = (event) => event.preventDefault();
    this.scrollBottomButton.addEventListener("click", this.scrollBottomClickListener);
    this.scrollBottomButton.addEventListener("pointerdown", this.scrollBottomPointerListener);
    view.scrollDOM.addEventListener("scroll", this.scrollListener, { passive: true });
    view.dom.appendChild(this.scrollBottomButton);
    this.decorations = buildDecorations(view);
    this.scheduleTypewriterCenter(view);
    this.scheduleScrollBottomUpdate();
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged
    ) {
      this.decorations = buildDecorations(update.view);
    }
    if (update.docChanged || update.selectionSet) {
      this.scheduleTypewriterCenter(update.view);
    }
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.scheduleScrollBottomUpdate();
    }
  }

  destroy(): void {
    if (this.centerFrame !== undefined) {
      window.cancelAnimationFrame(this.centerFrame);
    }
    if (this.scrollBottomFrame !== undefined) {
      window.cancelAnimationFrame(this.scrollBottomFrame);
    }
    document.removeEventListener(
      "cw-typewriter-position-change",
      this.positionChangeListener,
    );
    this.view.scrollDOM.removeEventListener("scroll", this.scrollListener);
    this.scrollBottomButton.removeEventListener("click", this.scrollBottomClickListener);
    this.scrollBottomButton.removeEventListener("pointerdown", this.scrollBottomPointerListener);
    this.scrollBottomButton.remove();
  }

  private scheduleScrollBottomUpdate(): void {
    if (this.scrollBottomFrame !== undefined) {
      window.cancelAnimationFrame(this.scrollBottomFrame);
    }
    this.scrollBottomFrame = window.requestAnimationFrame(() => {
      this.scrollBottomFrame = undefined;
      const { scrollTop, clientHeight, scrollHeight } = this.view.scrollDOM;
      const visible = shouldShowScrollToBottom(scrollTop, clientHeight, scrollHeight);
      this.scrollBottomButton.classList.toggle("is-visible", visible);
      this.scrollBottomButton.setAttribute("aria-hidden", String(!visible));
      this.scrollBottomButton.tabIndex = visible ? 0 : -1;
    });
  }

  private scrollToBottom(): void {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ?? false;
    this.view.scrollDOM.scrollTo({
      top: this.view.scrollDOM.scrollHeight - this.view.scrollDOM.clientHeight,
      behavior: getScrollToBottomBehavior(reducedMotion),
    });
  }

  private scheduleTypewriterCenter(view: EditorView, forceActiveView = false): void {
    const activeWorkspaceLeaf = view.dom.closest(".workspace-leaf.mod-active");
    if (
      (!view.hasFocus && !(forceActiveView && activeWorkspaceLeaf)) ||
      !document.body.classList.contains("cw-typewriter-mode") ||
      !view.dom.closest(".cw-novel-enabled")
    ) {
      return;
    }

    if (this.centerFrame !== undefined) {
      window.cancelAnimationFrame(this.centerFrame);
    }
    this.centerFrame = window.requestAnimationFrame(() => {
      this.centerFrame = undefined;
      const coordinates = view.coordsAtPos(view.state.selection.main.head);
      if (!coordinates) return;
      const viewport = view.scrollDOM.getBoundingClientRect();
      const configuredPosition = Number.parseFloat(
        document.documentElement.style.getPropertyValue("--cw-typewriter-position"),
      );
      const delta = calculateTypewriterScrollDelta(
        coordinates.top,
        viewport.top,
        viewport.height,
        configuredPosition,
      );
      if (Math.abs(delta) > 1) view.scrollDOM.scrollTop += delta;
    });
  }
}

export function createWritingEditorExtension(
  isQuoteInputEnabled: () => boolean = () => true,
  setEditorIcon: EditorIconSetter = createFallbackEditorIcon,
): Extension {
  class ConfiguredChineseWritingViewPlugin extends ChineseWritingViewPlugin {
    constructor(view: EditorView) {
      super(view, setEditorIcon);
    }
  }
  return [createQuoteInputExtension(isQuoteInputEnabled), ViewPlugin.fromClass(ConfiguredChineseWritingViewPlugin, {
    decorations: (plugin) => plugin.decorations,
  })];
}
