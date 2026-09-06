import { Prec, StateEffect, StateField, type EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { getMarkdownLineContexts, splitMarkdownLine } from "./markdown-protection";

interface GeneratedPair { open: number; close: number; left: string; right: string }
const addPair = StateEffect.define<GeneratedPair>();
const forgetPair = StateEffect.define<number>();

// Session-only state, deliberately not serialized into notes or settings.
export const quotePairs = StateField.define<readonly GeneratedPair[]>({
  create: () => [],
  update(pairs, tr) {
    let next = pairs.filter(pair => {
      let replaced = false;
      tr.changes.iterChangedRanges((from, to) => {
        if ((from <= pair.open && to > pair.open) || (from <= pair.close && to > pair.close)) replaced = true;
      });
      return !replaced;
    }).map(pair => ({ ...pair,
      open: tr.changes.mapPos(pair.open, 1), close: tr.changes.mapPos(pair.close, 1),
    })).filter(pair => tr.newDoc.sliceString(pair.open, pair.open + 1) === pair.left
      && tr.newDoc.sliceString(pair.close, pair.close + 1) === pair.right);
    for (const effect of tr.effects) {
      if (effect.is(addPair)) next.push(effect.value);
      if (effect.is(forgetPair)) next = next.filter(pair => pair.close !== effect.value);
    }
    return next;
  },
});

export function createQuoteInsertion(state: EditorState, from: number, to: number, text: string, enabled = true): TransactionSpec | null {
  if (!enabled) return null;
  const right = text === "“" ? "”" : text === "‘" ? "’" : undefined;
  if (!right || from !== to || state.selection.ranges.length !== 1
    || !state.selection.main.empty || state.selection.main.head !== from
    || state.doc.sliceString(from, from + 1) === right) return null;
  const line = state.doc.lineAt(from);
  const contexts = getMarkdownLineContexts(state.doc.toString().split("\n"));
  if (contexts[line.number - 1].stronglyProtected || /^(?: {4}|\t)/u.test(line.text)
    || splitMarkdownLine(line.text).some(segment => !segment.editable)) return null;
  return {
    changes: { from, insert: text + right },
    selection: { anchor: from + 1 },
    effects: addPair.of({ open: from, close: from + 1, left: text, right }),
    userEvent: "input.type",
  };
}

export function createQuoteJump(state: EditorState, enabled = true): TransactionSpec | null {
  if (!enabled) return null;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return null;
  const head = state.selection.main.head;
  const pair = state.field(quotePairs, false)?.find(pair => pair.close === head);
  if (!pair) return null;
  return { selection: { anchor: head + 1 }, effects: forgetPair.of(head), scrollIntoView: true, userEvent: "select" };
}

type QuoteKey = Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "shiftKey" | "ctrlKey" | "altKey" | "metaKey">;
export function shouldJumpQuote(event: QuoteKey, composing: boolean): boolean {
  return event.key === "Enter" && !composing && !event.isComposing && event.keyCode !== 229
    && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export function createQuoteInputExtension(isEnabled: () => boolean = () => true): Extension {
  // Some IMEs emit compositionend before the confirming Enter keydown.
  const compositionGuard = ViewPlugin.fromClass(class { endedAt = -Infinity; }, {
    eventHandlers: {
      compositionend() { this.endedAt = Date.now(); },
    },
  });
  return [quotePairs, compositionGuard,
    Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
      if (view.composing) return false;
      const transaction = createQuoteInsertion(view.state, from, to, text, isEnabled());
      if (!transaction) return false;
      view.dispatch(transaction);
      return true;
    })),
    Prec.highest(EditorView.domEventHandlers({
      keydown(event, view) {
        const justComposed = Date.now() - (view.plugin(compositionGuard)?.endedAt ?? -Infinity) < 50;
        if (!shouldJumpQuote(event, view.composing || justComposed)) return false;
        const transaction = createQuoteJump(view.state, isEnabled());
        if (!transaction) return false;
        event.preventDefault();
        view.dispatch(transaction);
        return true;
      },
    })),
  ];
}
