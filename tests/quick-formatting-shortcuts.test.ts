import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/types";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const panelSource = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const settingsSource = readFileSync(resolve("src/settings.ts"), "utf8");
const stylesSource = readFileSync(resolve("styles.css"), "utf8");
const writingModeSource = readFileSync(resolve("src/writing-mode.ts"), "utf8");

describe("saved one-click formatting shortcuts", () => {
  it("keeps both optional automatic entry points disabled by default", () => {
    expect(DEFAULT_SETTINGS.showQuickFormattingRibbon).toBe(false);
    expect(DEFAULT_SETTINGS.autoFormatOnManualWritingMode).toBe(false);
    expect(mainSource).toContain(
      'showQuickFormattingRibbon: typeof stored?.showQuickFormattingRibbon === "boolean"',
    );
    expect(mainSource).toContain(
      'autoFormatOnManualWritingMode: typeof stored?.autoFormatOnManualWritingMode === "boolean"',
    );
  });

  it("renders one full formatting button with aligned undo and settings actions", () => {
    expect(panelSource).toContain('cls: "cw-panel-format-launcher"');
    expect(panelSource).toContain('cls: "cw-panel-format-primary"');
    expect(panelSource).toContain('cls: "cw-panel-format-settings"');
    expect(panelSource).toContain('cls: "cw-panel-format-undo"');
    expect(panelSource).toContain('cls: "cw-panel-format-actions"');
    expect(panelSource).toContain("this.plugin.applySavedFormatting()");
    expect(panelSource).toContain("this.plugin.undoCurrentEditorChange()");
    expect(panelSource).toContain("this.plugin.openFormattingModal()");
    expect(panelSource).toContain('setIcon(settingsIcon, "settings")');
    expect(stylesSource).toContain(".cw-panel-format-primary");
    expect(stylesSource).toContain(".cw-panel-format-settings");
    expect(stylesSource).toContain(".cw-panel-format-settings:focus-visible");
    expect(stylesSource).toMatch(
      /\.cw-panel-format-launcher\s*\{[\s\S]*position:\s*relative;/,
    );
    expect(stylesSource).toMatch(
      /\.cw-panel-format-actions\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset-block-start:/,
    );
    expect(stylesSource).toContain(".cw-panel-format-undo");
    expect(stylesSource).toMatch(
      /\.cw-panel-format-undo svg,[\s\S]*\.cw-panel-format-settings svg\s*\{[\s\S]*display:\s*block;/,
    );
    expect(stylesSource).not.toContain("grid-template-columns: minmax(0, 1fr) 42px");
    expect(stylesSource).not.toMatch(
      /\.cw-panel-format-settings\s*\{[^}]*border-inline-start:/,
    );
  });

  it("undoes the active editor without relying on editor focus", () => {
    expect(mainSource).toContain("undoCurrentEditorChange(): void");
    expect(mainSource).toMatch(
      /undoCurrentEditorChange\(\): void[\s\S]*getWritingMarkdownView\(\)\?\.editor[\s\S]*editor\.undo\(\)/,
    );
  });

  it("restores the currently selected layout template from the workbench", () => {
    expect(panelSource).toContain('text: "恢复上次选择的模板"');
    expect(panelSource).toContain("this.plugin.resetCurrentLayoutPreset()");
    expect(mainSource).toContain("async resetCurrentLayoutPreset(): Promise<void>");
    expect(mainSource).toContain("getCurrentLayoutResetPresetId(): LayoutPresetId | null");
    expect(mainSource).toContain("lastSelectedLayoutPreset");
    expect(mainSource).toContain("await this.applyLayoutPreset(presetId)");
    expect(panelSource).not.toContain('text: "恢复当前模板"');
  });

  it("delegates saved formatting through the existing undoable pipeline", () => {
    expect(mainSource).toContain("async applySavedFormatting(editor?: Editor): Promise<void>");
    expect(mainSource).toMatch(
      /applySavedFormatting\(editor\?: Editor\)[\s\S]*this\.settings\.formattingRules[\s\S]*this\.settings\.formattingPreset[\s\S]*false[\s\S]*this\.settings\.formattingRuleOrder[\s\S]*this\.settings\.markdownFormatting/,
    );
    expect(mainSource).toContain('new Notice("请先打开一篇 Markdown 笔记")');
    expect(mainSource).toContain('new Notice("排版失败，请重试")');
  });

  it("fully applies newly saved formatting defaults before the modal closes", () => {
    expect(mainSource).toMatch(
      /saveFormattingSettings\([\s\S]*this\.settings\.formattingPreset = preset;[\s\S]*this\.settings\.formattingRules = \{ \.\.\.rules \};[\s\S]*await this\.saveAndApplySettings\(false\)/,
    );
  });

  it("creates the optional ribbon only when enabled and appends it last", () => {
    expect(mainSource).toMatch(/this\.addRibbonIcon\(\r?\n      "wand-sparkles"/);
    expect(mainSource).toContain("syncQuickFormattingRibbonVisibility");
    expect(mainSource).toContain("setQuickFormattingRibbonVisible");
    expect(mainSource).toContain("this.settings.showQuickFormattingRibbon");
    expect(mainSource).toContain("this.quickFormattingRibbon?.remove()");
    expect(mainSource).toContain("ribbon.parentElement?.append(ribbon)");
    expect(mainSource).not.toMatch(/toggleAttribute\(\r?\n      \"hidden\"/);
    expect(settingsSource).toContain('setName("显示一键排版 Ribbon 按钮")');
    expect(settingsSource).toContain("setQuickFormattingRibbonVisible(value)");
  });

  it("opens the default formatting configuration from plugin settings", () => {
    expect(settingsSource).toContain('setName("默认一键排版方案")');
    expect(settingsSource).toContain('setButtonText("打开排版设置")');
    expect(settingsSource).toContain("this.plugin.openFormattingModal()");
  });

  it("auto-formats only for an enabled manual off-to-on transition", async () => {
    const helperName = "shouldAutoFormatOnManualWritingModeTransition";
    expect(writingModeSource).toContain(`export function ${helperName}`);
    if (!writingModeSource.includes(`export function ${helperName}`)) return;

    const modulePath = "../src/writing-mode.ts";
    const writingMode = await import(/* @vite-ignore */ modulePath) as Record<string, unknown>;
    const shouldAutoFormat = writingMode[helperName] as (
      wasEnabled: boolean,
      isEnabled: boolean,
      settingEnabled: boolean,
    ) => boolean;

    expect(shouldAutoFormat(false, true, true)).toBe(true);
    expect(shouldAutoFormat(false, true, false)).toBe(false);
    expect(shouldAutoFormat(true, true, true)).toBe(false);
    expect(shouldAutoFormat(true, false, true)).toBe(false);
    expect(mainSource).toContain(
      "shouldAutoFormatOnManualWritingModeTransition",
    );
    expect(settingsSource).toContain('setName("手动开启写作模式时自动一键排版")');
  });

  it("does not redraw the writing panel while its first click activates the leaf", () => {
    const eventStart = mainSource.indexOf(
      'this.app.workspace.on("active-leaf-change"',
    );
    const eventEnd = mainSource.indexOf("this.registerEvent(", eventStart + 1);
    const eventBody = mainSource.slice(eventStart, eventEnd);

    expect(eventStart).toBeGreaterThanOrEqual(0);
    expect(eventBody).toContain("leaf?.view instanceof WritingPanelView");
    expect(eventBody).toMatch(
      /if \(!\(leaf\?\.view instanceof WritingPanelView\)\) \{\s*this\.refreshWritingPanels\(\);\s*\}/,
    );
  });
});
