import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../src/types";
import { createQuoteInsertion, createQuoteJump, quotePairs, shouldJumpQuote } from "../src/quote-input";

function state(doc = "", anchor = doc.length): EditorState {
  return EditorState.create({ doc, selection: { anchor }, extensions: [quotePairs] });
}

describe("automatic Chinese quote pairs", () => {
  it("can disable insertion and Enter jumping through one persisted setting", () => {
    expect(DEFAULT_SETTINGS.autoPairChineseQuotes).toBe(true);
    const original = state();
    expect(createQuoteInsertion(original, 0, 0, "“", false)).toBeNull();
    const paired = original.update(createQuoteInsertion(original, 0, 0, "“")!).state;
    expect(createQuoteJump(paired, false)).toBeNull();
    expect(readFileSync("src/settings.ts", "utf8")).toContain('.setName("中文引号自动配对")');
    expect(readFileSync("src/main.ts", "utf8"))
      .toContain('() => this.settings.autoPairChineseQuotes,');
  });
  it.each([["“", "”"], ["‘", "’"]])("pairs %s in one transaction", (open, close) => {
    const original = state();
    const next = original.update(createQuoteInsertion(original, 0, 0, open)!).state;
    expect(next.doc.toString()).toBe(open + close);
    expect(next.selection.main.head).toBe(1);
    const typed = next.update({ changes: { from: 1, insert: "你好" }, selection: { anchor: 3 } }).state;
    const jumped = typed.update(createQuoteJump(typed)!).state;
    expect(jumped.doc.toString()).toBe(open + "你好" + close);
    expect(jumped.selection.main.head).toBe(4);
    expect(createQuoteJump(jumped)).toBeNull();
  });
  it("does not jump over existing quotes or from the middle of text", () => {
    expect(createQuoteJump(state("“你好”", 3))).toBeNull();
    let next = state();
    next = next.update(createQuoteInsertion(next, 0, 0, "“")!).state;
    next = next.update({ changes: { from: 1, insert: "你好" }, selection: { anchor: 2 } }).state;
    expect(createQuoteJump(next)).toBeNull();
  });
  it("drops tracking when a generated delimiter is replaced", () => {
    let next = state();
    next = next.update(createQuoteInsertion(next, 0, 0, "“")!).state;
    next = next.update({ changes: { from: 1, to: 2, insert: "”" }, selection: { anchor: 1 } }).state;
    expect(createQuoteJump(next)).toBeNull();
  });
  it("does not duplicate a closing quote already at the cursor", () => {
    expect(createQuoteInsertion(state("”", 0), 0, 0, "“")).toBeNull();
  });
  it("ignores selection replacements, non-openers and protected Markdown", () => {
    expect(createQuoteInsertion(state("文字"), 0, 2, "“")).toBeNull();
    expect(createQuoteInsertion(state(), 0, 0, "“文字”")).toBeNull();
    for (const doc of ["```\n代码", "---\ntitle: ", "    code", "`code`", "[标签](path)"]) {
      const pos = doc.endsWith("`") || doc.endsWith(")") ? doc.length - 1 : doc.length;
      expect(createQuoteInsertion(state(doc, pos), pos, pos, "“")).toBeNull();
    }
  });
  it("leaves IME confirmation and modified Enter alone", () => {
    const event = { key: "Enter", isComposing: false, keyCode: 13, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    expect(shouldJumpQuote(event, false)).toBe(true);
    expect(shouldJumpQuote(event, true)).toBe(false);
    expect(shouldJumpQuote({ ...event, isComposing: true }, false)).toBe(false);
    expect(shouldJumpQuote({ ...event, keyCode: 229 }, false)).toBe(false);
    expect(shouldJumpQuote({ ...event, shiftKey: true }, false)).toBe(false);
  });
});

describe("quote input registration", () => {
  it("offers the same global setting under workbench writing assistance", () => {
    expect(readFileSync("src/writing-panel.ts", "utf8")).toMatch(/text: "写作辅助"[\s\S]*?this\.addToggle\(section, "中文引号自动配对", "autoPairChineseQuotes"\)/);
  });
  it("registers a quote input extension with the writing editor", () => {
    expect(readFileSync("src/editor-extension.ts", "utf8")).toContain("createQuoteInputExtension(isQuoteInputEnabled)");
  });
});
