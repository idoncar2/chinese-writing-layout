import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(resolve("src/writing-panel.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");

describe("native current-note shortcuts", () => {
  it("exposes find/replace and snapshot-history buttons that delegate to Obsidian", () => {
    expect(panelSource).toContain('"查找替换"');
    expect(panelSource).toContain("this.plugin.openNativeFindReplace()");
    expect(panelSource).toContain('"历史版本"');
    expect(panelSource).toContain("this.plugin.openFileRecoverySnapshots()");
    expect(panelSource).not.toContain('"移入回收站"');
    expect(panelSource).not.toContain("this.plugin.trashCurrentNote()");

    expect(mainSource).toContain('executeCommandById("editor:open-search-replace")');
    expect(mainSource).toContain('executeCommandById("file-recovery:open")');
    expect(mainSource).toContain("请先在“设置 → 核心插件”中启用“文件恢复”。");
    expect(mainSource).not.toContain("trashCurrentNote");
  });
});
