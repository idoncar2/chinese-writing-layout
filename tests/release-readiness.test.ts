import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const modalSource = readFileSync(resolve("src/export-modal.ts"), "utf8");
const panelSource = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const folderSource = readFileSync(resolve("src/system-folder.ts"), "utf8");
const readme = readFileSync(resolve("README.md"), "utf8");
const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8")) as {
  description: string;
};

describe("v1 release readiness", () => {
  it("keeps desktop folder opening without spawning PowerShell", () => {
    expect(mainSource).toContain('require("electron")');
    expect(folderSource).not.toContain("child_process");
    expect(folderSource).not.toContain("powershell.exe");
    expect(folderSource).not.toContain("process.platform");
  });

  it("keeps mobile export enabled while disabling only folder actions", () => {
    expect(modalSource).toContain("Platform.isMobileApp");
    expect(modalSource).toContain("移动端不可用");
    expect(modalSource).toContain('text: "开始导出"');
    expect(modalSource).not.toContain("exportButton.disabled = Platform.isMobileApp");
    expect(modalSource).toContain("复制全文");
    expect(modalSource).toContain("预览内容");
    expect(mainSource).toContain("const mobileVaultExport = Platform.isMobileApp;");
    expect(panelSource).toContain("Platform.isMobileApp");
    expect(panelSource).toContain('"移动端不可用"');
  });

  it("documents the current writing, font, export and mobile behavior", () => {
    expect(readme).not.toContain("当前版本：**0.15.2**");
    expect(readme).not.toContain("读取本机已安装字体");
    expect(readme).not.toContain("开启写作模式后，插件会使用标准属性记录状态");
    expect(readme).toContain("导入 `.ttf`、`.otf`、`.woff` 或 `.woff2`");
    expect(readme).toContain("文件夹、Tag、文件名和 CSS Class");
    expect(readme).toContain("移动端");
    expect(readme).toContain("移动端仍可导出");
    expect(manifest.description.endsWith(".")).toBe(true);
  });
});
