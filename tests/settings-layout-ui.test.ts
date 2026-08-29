import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/settings.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("settings page layout", () => {
  it("renders a themed page with named sections and reusable groups", () => {
    expect(source).toContain('containerEl.addClass("cw-settings-page")');
    expect(source).toContain("cw-settings-header");
    expect(source).toContain("renderAppearanceSettings");
    expect(source).toContain("renderWritingModeSettings");
    expect(source).toContain("renderLayoutSettings");
    expect(source).toContain('"letterSpacing"');
    expect(source).toContain("字距");
    expect(source).toContain("renderWritingAssistanceSettings");
    expect(source).toContain("createSettingsSection");
    expect(source).toContain("createSettingsGroup");
    expect(source).toContain("外观与界面");
    expect(source).toContain("写作范围与自动套用");
    expect(source).toContain("正文排版");
    expect(source).toContain("写作辅助");
    expect(source).toContain("CSS Classes 兼容设置");
    expect(source).toContain("恢复全部插件设置");
  });

  it("keeps appearance fields without rendering an effect preview", () => {
    expect(source).toContain("interfaceMode");
    expect(source).toContain("interfaceAccentMode");
    expect(source).toContain("interfaceAccentColor");
    expect(source).not.toContain("cw-settings-accent-preview");
    expect(source).not.toContain("效果预览");
  });

  it("uses scoped grouped rows and responsive rule-card styles", () => {
    expect(styles).toContain(".cw-settings-page .cw-settings-section");
    expect(styles).toContain(".cw-settings-page .cw-settings-group");
    expect(styles).toContain(".cw-settings-page .cw-settings-group > .setting-item");
    expect(styles).toContain("border-block-start: 1px solid var(--background-modifier-border)");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-card");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-card-header");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-row");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-controls");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-actions");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-status");
    expect(styles).toContain(".cw-settings-page .cw-settings-rule-draft-hint");
    expect(styles).toContain(".cw-settings-page .cw-settings-add-rule");
    expect(styles).toContain("--cw-panel-accent-action");
    expect(styles).toContain("outline: 2px solid var(--cw-panel-accent)");
    expect(styles).toContain("overflow-x: clip");
    expect(styles).toContain("color-mix(in srgb, var(--cw-panel-accent)");
    expect(styles).toContain("letter-spacing: var(--cw-letter-spacing)");
    expect(mainSource).toContain('"--cw-letter-spacing"');
    expect(mainSource).toContain('"cw-follow-override-letter-spacing"');
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toContain("@media (max-width: 500px)");
    expect(styles).not.toContain("cw-settings-accent-preview");
    expect(styles).not.toMatch(/\.cw-settings-auto-rule(?:\s|[.{#])/);
    expect(styles).not.toMatch(/(^|\n)\.setting-item\s*\{/);
  });

  it("preserves the settings page scroll position when a control redraws it", () => {
    expect(source).toContain("getSettingsScrollContainer");
    expect(source).toContain("const previousScrollTop = scrollContainer.scrollTop");
    expect(source).toContain("restoreSettingsScroll");
    expect(source).toContain("scrollContainer.scrollTop = Math.min");
  });

  it("serializes saves and avoids delayed full-page redraws for ordinary changes", () => {
    expect(mainSource).toContain("SettingsSaveQueue");
    expect(mainSource).toContain("enqueueSettingsSave");
    expect(source).toContain("private renderCustomAccentSetting");
    expect(source).toContain("let paperThemeSelect");
    expect(source).toContain("setting.descEl.setText");
    expect(source).not.toContain("saveAndApplySettings().then(() => this.display())");
  });
});
