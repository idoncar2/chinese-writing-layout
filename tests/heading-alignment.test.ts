import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as typesModule from "../src/types";
import { DEFAULT_SETTINGS } from "../src/types";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const settingsSource = readFileSync(resolve("src/settings.ts"), "utf8");
const writingPanelSource = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const normalizedWritingPanelSource = writingPanelSource.replace(/\r\n/g, "\n");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("heading alignment settings", () => {
  it("defaults to no centered headings and normalizes selected levels", () => {
    const settings = DEFAULT_SETTINGS as typeof DEFAULT_SETTINGS & {
      centerHeadings?: boolean;
      centerHeadingLevels?: number[];
    };
    expect(settings.centerHeadings).toBe(false);
    expect(settings.centerHeadingLevels).toEqual([1]);

    const normalizeHeadingLevels = (typesModule as typeof typesModule & {
      normalizeHeadingLevels?: (value: unknown) => number[];
    }).normalizeHeadingLevels;
    expect(normalizeHeadingLevels).toBeTypeOf("function");
    expect(normalizeHeadingLevels!([6, 2, 2, 7, 0, "h3"])).toEqual([2, 6]);
    expect(normalizeHeadingLevels!([])).toEqual([]);
  });

  it("renders compact collapsed controls in the writing panel", () => {
    expect(settingsSource).not.toContain('setName("标题居中")');
    expect(settingsSource).not.toContain("renderHeadingCenteringSettings");
    expect(writingPanelSource).toContain("private headingCenteringOpen = false;");
    expect(writingPanelSource).toContain("cw-panel-heading-centering");
    expect(writingPanelSource).toContain('createEl("details"');
    expect(writingPanelSource).toContain("centerHeadingLevels");
    expect(writingPanelSource).toContain("HEADING_LEVELS");
    expect(writingPanelSource).toContain("label.createSpan({ text: `H${level}` })");
    expect(writingPanelSource).toContain('aria-label": `标题 H${level} 居中`');
    expect(styles).toContain(".cw-panel-heading-centering");
  });

  it("places heading centering and justification above the divider", () => {
    expect(normalizedWritingPanelSource).toContain(
      'this.renderHeadingCenteringControls(section);\n    this.addToggle(section, "两端对齐", "justifyText", "cw-panel-justify-row");\n\n    section.createDiv({ cls: "cw-panel-alignment-divider" });\n\n    this.renderLayoutResetAction(section);',
    );
    expect(writingPanelSource).toContain('cls: "cw-panel-font-help cw-panel-heading-centering"');

    const summaryStart = styles.indexOf(
      ".cw-panel-content .cw-panel-heading-centering > summary",
    );
    const summaryEnd = styles.indexOf(
      ".cw-panel-content .cw-panel-heading-summary-label",
      summaryStart,
    );
    const summaryStyles = styles.slice(summaryStart, summaryEnd);
    expect(summaryStyles).toContain("font-size: var(--font-ui-smaller);");
    expect(summaryStyles).toContain("color: var(--text-normal);");
    expect(summaryStyles).toContain("font-weight: 400;");
    expect(summaryStyles).not.toContain("font-weight: 600;");
    expect(styles).toContain(".cw-panel-content .cw-panel-alignment-divider");
    expect(styles).toContain(
      "border-block-start: 1px solid var(--background-modifier-border);",
    );
    const justifyStart = styles.indexOf(
      ".cw-panel-content .cw-panel-justify-row",
    );
    const justifyEnd = styles.indexOf("}", justifyStart);
    expect(styles.slice(justifyStart, justifyEnd)).not.toContain(
      "border-block-start",
    );
  });

  it("applies selected heading classes to both preview and editor views", () => {
    expect(mainSource).toContain("HEADING_CENTER_CLASSES");
    expect(mainSource).toContain("centerHeadingLevels");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(styles).toContain(`cw-heading-center-h${level}`);
      expect(styles).toContain(`.markdown-preview-view h${level}`);
      expect(styles).toContain(`.HyperMD-header-${level}`);
    }
    expect(styles).not.toContain(
      ".workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian) .markdown-preview-view h1,\n.workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian) .HyperMD-header-1",
    );
  });

  it("keeps centered headings above theme alignment overrides", () => {
    expect(styles).toContain("text-align: center !important;");
  });
});
