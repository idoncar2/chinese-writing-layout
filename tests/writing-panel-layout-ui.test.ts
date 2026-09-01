import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("writing panel layout font UI", () => {
  it("shows a clickable layout source below the current note and locates the single layout scope control", () => {
    expect(source).toContain("getCurrentLayoutSourceStatus");
    expect(source).toContain("cw-panel-layout-source");
    expect(source).toContain('text: `版式来源：${layoutSourceStatus}`');
    expect(source).not.toContain("cw-panel-layout-source-arrow");
    expect(source).not.toContain("cw-panel-layout-source-label");
    expect(source).toContain('"aria-label": `当前版式来源：${layoutSourceStatus}；点击前往版式微调`');
    expect(source).toContain('querySelector<HTMLElement>(".cw-panel-layout-scope")');
    expect(source).toContain('querySelector<HTMLInputElement>(".cw-panel-layout-scope input")');
    expect(source).toContain("const targetTop = this.contentEl.scrollTop");
    expect(source).toContain("scope.getBoundingClientRect().top");
    expect(source).toContain("this.contentEl.getBoundingClientRect().top");
    expect(source).toContain("this.contentEl.scrollTop = Math.max(0, targetTop);");
    expect(source).toContain("this.panelScrollTop = this.contentEl.scrollTop;");
    expect(source).not.toContain('scope.scrollIntoView({ behavior: "smooth"');
    expect(source).toContain('scope.addClass("is-located")');
    expect(styles).toContain(".cw-panel-layout-source:focus-visible");
    expect(styles).toMatch(/\.cw-panel-layout-source\s*\{[^}]*appearance:\s*none;[^}]*background:\s*none;/s);
    expect(styles).toMatch(/\.cw-panel-layout-source\s*\{[^}]*border:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s);
    expect(styles).toMatch(/\.cw-panel-note-card\s*\{[^}]*border:\s*0;/s);
    expect(styles).toContain(".cw-panel-layout-scope.is-located");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the typewriter tool available outside writing mode", () => {
    expect(source).toMatch(
      /"打字机",\s*"输入行居中",\s*this\.plugin\.isTypewriterModeEnabled\(\),\s*\(\) => void this\.plugin\.toggleTypewriterMode\(\),\s*!this\.plugin\.getWritingMarkdownView\(\)\?\.file,/s,
    );
  });

  it("shows the Obsidian baseline font and renders font rows from the current layout snapshot", () => {
    expect(source).toContain("字体：${getObsidianFontDisplayName(obsidianBaseline.fontFamily)}");
    expect(source).toContain("字距：${formatLetterSpacing(obsidianBaseline.letterSpacing)}");
    expect(source).toContain("this.renderFontControls(section, layout);");
    expect(source).toContain("private renderFontControls(section: HTMLElement, layout: LayoutPresetValues)");
    expect(source).toContain("const currentSelection = layout[config.selectionKey];");
    expect(source).toContain("getFontSelectionDisplayName");
    expect(source).toContain("getFontSelectionPreviewFamily");
  });

  it("offers letter spacing beside the existing layout sliders", () => {
    expect(source).toContain('key: "letterSpacing"');
    expect(source).toContain('label: "字距"');
    expect(source).toContain('unit: "px"');
  });

  it("exposes compact undo and redo controls for layout changes", () => {
    expect(source).toContain("cw-panel-layout-history");
    expect(source).toContain('setIcon(undoButton, "undo-2")');
    expect(source).toContain('setIcon(redoButton, "redo-2")');
    expect(source).toContain("canUndoCurrentLayoutChange");
    expect(source).toContain("canRedoCurrentLayoutChange");
    expect(source).toContain("undoCurrentLayoutChange");
    expect(source).toContain("redoCurrentLayoutChange");
  });

  it("makes slider changes one cancelable layout transaction", () => {
    expect(source).toContain("beginLayoutChange");
    expect(source).toContain("commitLayoutChange");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("cancelLayoutChange");
  });

  it("keeps the panel vertically scrollable after repeated refreshes", () => {
    expect(source).toContain("private cancelPendingScrollRestore(): void");
    expect(source).toContain("private interruptPanelScrollRestore = (): void =>");
    expect(source).toContain("private panelTouchActive = false;");
    expect(source).toContain("private refreshPendingAfterTouch = false;");
    expect(source).toContain("private finishPanelTouch = (): void =>");
    expect(source).toContain('"touchstart"');
    expect(source).toContain('"touchend"');
    expect(source).toContain('"touchcancel"');
    expect(source).toContain("this.interruptPanelScrollRestore");
    expect(source).toMatch(
      /if \(this\.panelTouchActive\) \{\s*this\.refreshPendingAfterTouch = true;\s*return;\s*\}/s,
    );
    expect(source).toMatch(
      /const previousScrollTop = this\.restoringPanelScroll\s*\? this\.panelScrollTop\s*: container\.scrollTop;/s,
    );
    expect(source).not.toMatch(
      /const previousScrollTop = Math\.max\(\s*this\.panelScrollTop,\s*container\.scrollTop/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-content\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*-webkit-overflow-scrolling:\s*touch;/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-view\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-content\s*\{[^}]*overflow-anchor:\s*none;/s,
    );
  });
});
