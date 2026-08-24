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
  private readonly positionChangeListener: () => void;
  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.positionChangeListener = () => this.scheduleTypewriterCenter(this.view, true);
    document.addEventListener(
      "cw-typewriter-position-change",
      this.positionChangeListener,
    );
    this.decorations = buildDecorations(view);
    this.scheduleTypewriterCenter(view);
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
  }

  destroy(): void {
    if (this.centerFrame !== undefined) {
      window.cancelAnimationFrame(this.centerFrame);
    }
    document.removeEventListener(
      "cw-typewriter-position-change",
      this.positionChangeListener,
    );
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

export function createWritingEditorExtension(): Extension {
  return ViewPlugin.fromClass(ChineseWritingViewPlugin, {
    decorations: (plugin) => plugin.decorations,
  });
}
