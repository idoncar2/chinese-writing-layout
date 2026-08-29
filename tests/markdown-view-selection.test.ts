import { describe, expect, it } from "vitest";
import { selectMarkdownView } from "../src/markdown-view-selection";
import type { MarkdownView } from "obsidian";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");

const view = (path: string): MarkdownView => ({
  file: { path },
} as MarkdownView);

describe("markdown view selection", () => {
  it("falls back to an already loaded markdown leaf during startup", () => {
    const loadedView = view("正文/第一章.md");

    expect(selectMarkdownView(null, null, [loadedView])).toBe(loadedView);
  });

  it("prefers active and remembered markdown views over the fallback list", () => {
    const active = view("正文/当前.md");
    const remembered = view("正文/上次.md");
    const loaded = view("正文/第一章.md");

    expect(selectMarkdownView(active, remembered, [loaded])).toBe(active);
    expect(selectMarkdownView(null, remembered, [loaded])).toBe(remembered);
  });

  it("does not return a markdown view without a file", () => {
    const emptyView = { file: null } as unknown as MarkdownView;

    expect(selectMarkdownView(null, emptyView, [emptyView])).toBeNull();
  });

  it("retries the initial workspace sync after layout-ready startup", () => {
    expect(mainSource).toContain("scheduleStartupMarkdownSync");
    expect(mainSource).toContain("this.scheduleStartupMarkdownSync();");
  });

  it("lets the status bar follow the recent markdown note, not the active sidebar view", () => {
    // 当右侧写作工坊（非 Markdown 视图）处于激活状态时，
    // getActiveViewOfType(MarkdownView) 取不到正文，状态栏统计会失效。
    // updateStatusBar 必须走 getWritingMarkdownView 回退链。
    const start = mainSource.indexOf("private updateStatusBar(): void {");
    const next = mainSource.indexOf("\n  private ", start + 1);
    const body = mainSource.slice(start, next < 0 ? mainSource.length : next);
    expect(body).toContain("const view = this.getWritingMarkdownView();");
    expect(body).toContain("view?.file ?? null");
    // 注释允许提到旧 API，但方法体内不得再直接调用它。
    expect(body).not.toContain("this.app.workspace.getActiveViewOfType");
    expect(body).not.toContain("activeView");
  });
});
