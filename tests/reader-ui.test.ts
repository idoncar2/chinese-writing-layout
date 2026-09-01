import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readerFiles = [
  "src/reader/reader-view.ts",
  "src/reader/reader-renderer.ts",
  "src/reader/reader-settings-modal.ts",
  "src/reader/reader-mode-modal.ts",
  "src/reader/reader-pagination.ts",
  "src/reader/reader-position.ts",
  "src/reader/reader-constants.ts",
];

describe("reader mode UI integration", () => {
  it("keeps the experimental reader staged without exposing its entry points", () => {
    const allFilesExist = readerFiles.every((file) => existsSync(resolve(file)));
    expect(allFilesExist).toBe(true);
    if (!allFilesExist) return;

    const constants = readFileSync(resolve("src/reader/reader-constants.ts"), "utf8");
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    const panel = readFileSync(resolve("src/writing-panel.ts"), "utf8");
    const view = readFileSync(resolve("src/reader/reader-view.ts"), "utf8");
    const renderer = readFileSync(resolve("src/reader/reader-renderer.ts"), "utf8");
    const settings = readFileSync(resolve("src/reader/reader-settings-modal.ts"), "utf8");
    const mode = readFileSync(resolve("src/reader/reader-mode-modal.ts"), "utf8");
    const styles = readFileSync(resolve("styles.css"), "utf8");

    expect(constants).toContain("export const READER_MODE_ENABLED = false;");
    expect(main).toMatch(/if \(READER_MODE_ENABLED\) \{\s*this\.registerView\(/);
    expect(main).toMatch(
      /if \(READER_MODE_ENABLED\) \{\s*this\.addCommand\(\{\s*id: "open-desktop-reader"/,
    );
    expect(panel).toMatch(/if \(READER_MODE_ENABLED\) \{\s*this\.addToolButton\(/);
    expect(main).toMatch(
      /openReaderModeModal\(\): void \{\s*if \(!READER_MODE_ENABLED\) return;/,
    );
    expect(main).toMatch(
      /async openReader\(mode: ReaderMode\): Promise<void> \{\s*if \(!READER_MODE_ENABLED\) return;/,
    );
    expect(main).toContain("READER_VIEW_TYPE");
    expect(main).toContain("new ReaderView(leaf, this)");
    expect(main).toContain("打开桌面阅读");
    expect(main).toContain("打开手机预览");
    expect(panel).toContain("阅读模式");
    expect(panel).toContain("读者视角检查正文");
    expect(view).toContain("extends FileView");
    expect(view).toContain("MarkdownRenderer");
    expect(view).toContain("getState()");
    expect(view).toContain("setState(");
    expect(renderer).toContain("MarkdownRenderer.render");
    expect(renderer).toContain("syncReadingProseLines");
    expect(settings).toContain("阅读设置");
    expect(settings).toContain("FontPickerModal");
    expect(mode).toContain("选择阅读方式");
    expect(styles).toContain(".cw-reader-view");
    expect(styles).toContain(".cw-reader-phone");
    expect(styles).toContain("--cw-reader-background");
    expect(styles).toContain("safe-area-inset-top");
    expect(styles).not.toContain(".cw-reader-view.cw-novel-enabled");
  });

  it("keeps staged reader code compatible with the declared Obsidian API and CSS audit", () => {
    const settings = readFileSync(resolve("src/reader/reader-settings-modal.ts"), "utf8");
    const view = readFileSync(resolve("src/reader/reader-view.ts"), "utf8");

    expect(settings).not.toContain(".setDisplayFormat(");
    expect(settings).not.toMatch(/\.style(?:\.|\[)/);
    expect(view).not.toMatch(/\.style(?:\.|\[)/);
    expect(settings).toContain("setCssStyles(");
    expect(view).toContain("setCssProps(");
  });
});
