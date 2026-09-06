import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getScrollToBottomBehavior,
  shouldShowScrollToBottom,
} from "../src/editor-extension";

describe("editor scroll-to-bottom control", () => {
  it("shows only when the editor can scroll and is more than 40px from the bottom", () => {
    expect(shouldShowScrollToBottom(0, 600, 600)).toBe(false);
    expect(shouldShowScrollToBottom(0, 600, 1200)).toBe(true);
    expect(shouldShowScrollToBottom(559, 600, 1200)).toBe(true);
    expect(shouldShowScrollToBottom(560, 600, 1200)).toBe(false);
    expect(shouldShowScrollToBottom(600, 600, 1200)).toBe(false);
  });

  it("uses instant scrolling when reduced motion is requested", () => {
    expect(getScrollToBottomBehavior(false)).toBe("smooth");
    expect(getScrollToBottomBehavior(true)).toBe("auto");
  });

  it("owns one accessible button per CodeMirror view and removes its listeners", () => {
    const source = readFileSync("src/editor-extension.ts", "utf8");
    expect(source).toContain('className = "cw-editor-scroll-bottom"');
    expect(source).toContain('setEditorIcon(this.scrollBottomButton, "arrow-down-to-line")');
    expect(readFileSync("src/main.ts", "utf8"))
      .toContain('createWritingEditorExtension(() => this.settings.autoPairChineseQuotes, setIcon)');
    expect(source).toContain('setAttribute("aria-label", "滚动到正文底部")');
    expect(source).toContain('view.scrollDOM.addEventListener("scroll"');
    expect(source).toContain('this.view.scrollDOM.removeEventListener("scroll"');
    expect(source).toContain("this.scrollBottomButton.remove()");
    expect(source).toContain('toggle("is-visible"');
    expect(source).toContain('setAttribute("aria-hidden"');
  });

  it("scrolls the current view without dispatching a selection change", () => {
    const source = readFileSync("src/editor-extension.ts", "utf8");
    const start = source.indexOf("private scrollToBottom");
    const end = source.indexOf("\n  private ", start + 1);
    const method = source.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(method).toContain("this.view.scrollDOM.scrollTo({");
    expect(method).toContain("this.view.scrollDOM.scrollHeight - this.view.scrollDOM.clientHeight");
    expect(method).not.toContain("dispatch(");
    expect(method).not.toContain("selection");
    expect(method).not.toContain("focus(");
  });

  it("uses theme-aware compact styling with mobile and reduced-motion fallbacks", () => {
    const styles = readFileSync("styles.css", "utf8");
    expect(styles).toContain(".cw-editor-scroll-bottom");
    expect(styles).toMatch(/\.cw-editor-scroll-bottom\s*\{[^}]*position:\s*absolute/s);
    expect(styles).toMatch(/\.cw-editor-scroll-bottom\s*\{[^}]*pointer-events:\s*none/s);
    expect(styles).toMatch(/\.cw-editor-scroll-bottom\.is-visible\s*\{[^}]*pointer-events:\s*auto/s);
    expect(styles).toContain("var(--background-primary)");
    expect(styles).toContain("var(--text-muted)");
    expect(styles).toMatch(/@media \(max-width:\s*500px\)[\s\S]*?\.cw-editor-scroll-bottom\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cw-editor-scroll-bottom\s*\{[^}]*transition:\s*none/s);
  });
});
