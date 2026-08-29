import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const modalSource = readFileSync(resolve("src/export-modal.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("export experience UI", () => {
  it("exposes Markdown, preview, and copy actions", () => {
    expect(modalSource).toContain('addOption("md", "Markdown（.md）")');
    expect(modalSource).toContain("预览内容");
    expect(modalSource).toContain("复制全文");
    expect(modalSource).toContain("Markdown 导出会保留原始 Markdown 语法");
    expect(modalSource).toContain("打开当前文件所在文件夹");
    expect(modalSource).not.toContain('text: "保存位置"');
    expect(modalSource).not.toContain("本地文件系统（导出时选择）");
    expect(modalSource).not.toContain("不会在 Obsidian 文件列表中创建导出文件。");
    expect(modalSource).not.toContain('Platform.isMobileApp ? "写作导出/"');
    expect(modalSource).toContain('text: "开始导出"');
    expect(modalSource).not.toContain("exportButton.disabled = Platform.isMobileApp");
    expect(mainSource).toContain("prepareExportContent");
    expect(mainSource).toContain("navigator.clipboard.writeText");
    expect(mainSource).toContain("openCurrentNoteFolder");
    expect(mainSource).toContain("showItemInFolder");
    expect(mainSource).toContain("adapter.getFullPath(file.path)");
    expect(mainSource).toContain("showSaveDialog");
    expect(mainSource).toContain("fs/promises");
    expect(mainSource).toContain("const mobileVaultExport = Platform.isMobileApp;");
    expect(mainSource).toContain("this.app.vault.createBinary");
    expect(mainSource).toContain("this.app.vault.create(");
    expect(mainSource).toContain("已导出到本地");
  });

  it("keeps preview content literal, scrollable, and responsive", () => {
    expect(styles).toContain(".modal.cw-export-preview-modal");
    expect(styles).toContain(".cw-export-preview-textarea");
    expect(styles).toContain("overflow: auto");
    expect(styles).toContain("@media (max-width: 430px)");
  });
});
