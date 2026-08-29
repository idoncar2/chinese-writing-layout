import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/font-options.ts"), "utf8");
const settingsSource = readFileSync(resolve("src/settings.ts"), "utf8");
const panelSource = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("font picker presentation and interaction", () => {
  it("uses precise font sources instead of editable font stacks", () => {
    expect(source).toContain("FontSelection");
    expect(source).toContain('source: "obsidian"');
    expect(source).toContain('source: "user"');
    expect(source).toContain('source: "system"');
    expect(source).toContain("跟随 Obsidian");
    expect(source).toContain("我的字体");
    expect(source).toContain("系统字体");
    expect(source).not.toContain("字体读取顺序");
    expect(source).not.toContain("Windows 已安装字体");
    expect(source).not.toContain("快速组合");
    expect(source).not.toContain("我的组合");
    expect(source).not.toContain("最后后备字体");
  });

  it("passes structured selections and user-font metadata from both UI surfaces", () => {
    expect(settingsSource).toContain("fontSelectionToLegacyFontFamily");
    expect(settingsSource).toContain("this.plugin.settings.userFonts");
    expect(panelSource).toContain("fontSelectionToLegacyFontFamily");
    expect(panelSource).toContain("this.plugin.settings.userFonts");
    expect(panelSource).toContain("getFontSelectionDisplayName");
  });

  it("provides source-choice states and system-font input with accessible labels", () => {
    expect(source).toContain("aria-checked");
    expect(source).toContain("使用系统字体名称");
    expect(source).toContain("仅在当前设备已安装该字体时有效");
    expect(source).toContain("字体暂不可用");
    expect(styles).toContain(".cw-font-choice");
    expect(styles).toContain(".cw-font-source-section");
    expect(styles).toContain(".cw-font-system-setting");
  });

  it("keeps the simplified picker limited to user and manually named system fonts", () => {
    expect(source).toContain("快捷字体");
    expect(source).toContain("导入字体");
    expect(source).toContain("如何添加字体？");
    expect(source).not.toContain("renderBuiltinFonts");
    expect(source).not.toContain("内置字体");
    expect(styles).toContain(".cw-font-help");
    expect(mainSource).toContain("writeBinary");
    expect(mainSource).toContain("document.fonts");
    expect(mainSource).toContain("getUserFontDirectory");
    expect(source).toContain("findAvailableQuickFont");
  });

  it("keeps missing user font files as metadata and marks them unavailable at runtime", () => {
    expect(source).toContain("字体暂不可用，仍保留原引用");
    expect(mainSource).toContain("字体文件暂时不可用");
    expect(mainSource).toContain("this.availableUserFontIds");
    expect(mainSource).toContain("repairFontSelectionsAfterUserFontDeletion");
    expect(mainSource).toContain("renameUserFont");
    expect(mainSource).toContain("deleteUserFont");
    expect(mainSource).toContain("loadUserFonts");
  });

  it("loads imported font binaries without relying on desktop-style resource URLs", () => {
    expect(mainSource).toContain("const binary = await adapter.readBinary(path);");
    expect(mainSource).toContain("new FontFace(font.id, binary)");
    expect(mainSource).not.toContain("adapter.getResourcePath(path)");
  });

  it("selects an imported font immediately so mobile does not keep the old system fallback", () => {
    expect(source).toContain("importFont?: (file: File) => Promise<UserFont | null>;");
    expect(source).toContain('this.selectFont({ source: "user", id: imported.id });');
    expect(mainSource).toContain("importFont: (file) => this.importUserFont(file)");
    expect(source).toContain("快捷字体会随设备变化");
  });

  it("applies font selections immediately instead of waiting for a footer action", () => {
    expect(source).toContain("private applyCurrentSelection(): void");
    expect(source).toContain("this.applyCurrentSelection();");
    expect(source).not.toContain("应用字体列表");
  });

  it("keeps quick-font cards aligned when availability notes wrap", () => {
    expect(styles).toMatch(
      /\.cw-font-quick-list\s*\{[^}]*grid-auto-rows:\s*minmax\(76px,\s*auto\)/s,
    );
    expect(styles).toMatch(
      /\.cw-font-quick-list \.cw-font-choice\s*\{[^}]*align-items:\s*start/s,
    );
    expect(styles).toMatch(
      /\.cw-font-quick-list \.cw-font-choice-content\s*\{[^}]*align-content:\s*start/s,
    );
    expect(styles).toMatch(
      /\.cw-font-quick-list \.cw-font-choice-note\s*\{[^}]*min-height:/s,
    );
  });
});
