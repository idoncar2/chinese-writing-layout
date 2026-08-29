import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("layout history integration", () => {
  it("captures document snapshots before automatic-rule layouts are materialized", () => {
    expect(mainSource).toContain("captureLayoutHistorySnapshot");
    expect(mainSource).toContain("isRestoringLayoutHistory");
    expect(mainSource).toContain('target: { kind: "document", path }');
    expect(mainSource).toContain("documentLayout: null");
    expect(mainSource).toContain("ensureDocumentLayoutForCurrentFile");
  });

  it("creates an independent document layout on the first right-panel edit even for a global-default note", () => {
    // “全局默认开启 + 无规则”的笔记首次在右侧做版式微调时，必须基于当前显示
    // 版式快照新建一份独立 documentLayout，而不是直接改全局设置。
    const start = mainSource.indexOf("private ensureDocumentLayoutForCurrentFile");
    const next = mainSource.indexOf("\n  private ", start + 1);
    const body = mainSource.slice(start, next < 0 ? mainSource.length : next);
    // 未命中规则（全局默认 / 手动）时快照当前显示版式；命中规则时沿用规则模板，
    // 保持自动规则的优先级。
    expect(body).toContain("const existing = this.settings.documentLayouts[file.path];");
    expect(body).toContain('context.layoutSource.kind === "rule"');
    expect(body).toContain("rule?.layoutPreset ?? context.layoutPreset");
    expect(body).toContain("values: this.getLayoutSettingsForFile(file)");
    expect(body).toContain("this.settings.documentLayouts[file.path] = documentLayout;");
    // 编辑版式前先准备好独立版式，保证历史目标键一致、首次微调可撤回。
    const beginStart = mainSource.indexOf("beginLayoutChange(meta:");
    const beginNext = mainSource.indexOf("\n  private ", beginStart + 1);
    const beginBody = mainSource.slice(beginStart, beginNext);
    expect(beginBody).toContain("this.ensureDocumentLayoutForCurrentFile(file);");
    // 不再存在把未命中规则的笔记漏成全局修改的旧方法。
    expect(mainSource).not.toContain("ensureDocumentLayoutForAutomaticRule");
  });

  it("keeps history session-only and invalidates external global layout edits", () => {
    expect(mainSource).toContain("invalidateLayoutHistory");
    expect(mainSource).toContain('invalidateLayoutHistory("global")');
    expect(mainSource).not.toContain("layoutHistory:");
  });

  it("uses native icon buttons with scoped, theme-aware focus and disabled styles", () => {
    expect(styles).toContain(".cw-panel-layout-history");
    expect(styles).toContain(".cw-panel-layout-history button:disabled");
    expect(styles).toContain(".cw-panel-layout-history button:focus-visible");
    expect(styles).toContain("var(--background-modifier-border)");
    // 历史按钮本身不得有光晕；断言限定在该区块内，避免被其它插件作用域
    // （如弹窗 checkbox 的 0 0 0 2px 键盘聚焦环）误伤。
    const historyStart = styles.indexOf(".cw-panel-content .cw-panel-layout-history {");
    const historyEnd = styles.indexOf(".cw-panel-content .cw-panel-layout-history svg {");
    const historyBlock = styles.slice(historyStart, historyEnd);
    expect(historyBlock).toContain("box-shadow: none;");
    expect(historyBlock).not.toContain("box-shadow: 0 0 ");
  });
});
