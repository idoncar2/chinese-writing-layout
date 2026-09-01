import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("formatting modal compact controls", () => {
  const source = readFileSync(resolve("src/formatting-modal.ts"), "utf8");
  const styles = readFileSync(resolve("styles.css"), "utf8");

  it("separates preset management and keeps saved actions in the intended hierarchy", () => {
    expect(source).toContain("cw-format-preset-management");
    expect(source).toContain("方案管理");
    expect(source.indexOf("删除方案")).toBeLessThan(source.indexOf("另存为新方案"));
    expect(source.indexOf("另存为新方案")).toBeLessThan(source.indexOf("保存修改"));
    expect(source).toContain('"mod-cta"');
    expect(styles).toContain(".cw-format-preset-management");
    expect(styles).not.toContain(".cw-format-preset-management {\n  border-top:");
  });

  it("saves the selected defaults without formatting the open document", () => {
    expect(source).toContain('createButton(footer, "保存设置", "mod-cta")');
    expect(source).toMatch(/this\.plugin\s*\.saveFormattingSettings\(/);
    const footerStart = source.indexOf('const footer = this.contentEl.createDiv');
    const footerEnd = source.indexOf("onClose(): void", footerStart);
    const footerSource = source.slice(footerStart, footerEnd);
    expect(footerSource).not.toContain("this.plugin.applyFormatting(");
    expect(footerSource).not.toContain('"排版整篇"');
    expect(footerSource).not.toContain('"排版选区"');
    expect(source).toContain("保存后不会立即修改正文");
  });

  it("uses semantic checkbox options for multi-select rules", () => {
    expect(source).toContain("createCheckOption");
    expect(source).toContain('createEl("label"');
    expect(source).toContain('createEl("input", { type: "checkbox" })');
    expect(source).toContain("input.checked");
    expect(source).toContain("cw-format-check-grid");
    expect(styles).toContain(".cw-format-check-option");
    expect(styles).toContain(".cw-format-check-option.is-checked");
  });

  it("keeps compact controls light, theme-driven, and responsive", () => {
    expect(styles).toMatch(/\.cw-format-chip\s*\{[^}]*min-height:\s*28px/s);
    expect(styles).toMatch(/\.cw-format-chip\s*\{[^}]*border-radius:\s*999px/s);
    expect(styles).toMatch(/\.cw-format-check-grid\s*\{[^}]*gap:\s*4px 6px/s);
    expect(styles).toMatch(/\.cw-format-check-option\s*\{[^}]*min-height:\s*28px/s);
    expect(styles).toMatch(/\.cw-format-check-option\s*\{[^}]*padding:\s*3px 7px/s);
    expect(styles).toMatch(/\.cw-format-check-option\s*\{[^}]*border-radius:\s*7px/s);
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).toContain("@media (max-width: 500px)");
    expect(styles).toContain("grid-template-columns: 1fr");
    expect(styles).toContain("var(--cw-panel-accent)");
    expect(styles).not.toMatch(/\.cw-format-check-option\.is-checked\s*\{[^}]*box-shadow:/s);
    expect(styles).not.toMatch(/\.cw-format-chip\.is-active\s*\{[^}]*box-shadow:/s);
  });

  it("uses a softened semantic accent for the writing mode action without glow", () => {
    expect(styles).toMatch(
      /\.cw-panel-mode-button:not\(\.is-active\):not\(:disabled\)\s*\{[^}]*background:\s*var\(--cw-panel-accent-action\)/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-mode-button:not\(\.is-active\):not\(:disabled\)\s*\{[^}]*font-weight:/s,
    );
    expect(styles).not.toMatch(
      /\.cw-panel-mode-button:not\(\.is-active\):not\(:disabled\)\s*\{[^}]*var\(--interactive-accent\)/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-mode-button:not\(\.is-active\):not\(:disabled\)\s*\{[^}]*box-shadow:\s*none/s,
    );
    expect(styles).toMatch(
      /\.cw-panel-mode-button:not\(\.is-active\):not\(:disabled\):hover\s*\{[^}]*background:\s*var\(--cw-panel-accent-action-hover\)/s,
    );
    expect(styles).toContain(".cw-panel-mode-button.is-active");
    expect(styles).toMatch(/\.cw-panel-mode-button\.is-active\s*\{[^}]*box-shadow:\s*none/s);
    expect(styles).toMatch(/\.cw-panel-mode-button\.is-active::before\s*\{[^}]*content:/s);
    expect(styles).toMatch(/\.cw-panel-mode-button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--cw-panel-accent\)/s);
  });

  it("exposes independent syntax protection and semantic Markdown mode controls", () => {
    expect(source).toContain("protectSyntax");
    expect(source).toContain('role", "radiogroup"');
    expect(source).toContain('role", "radio"');
    expect(source).toContain("aria-checked");
    expect(source).toContain("heading");
    expect(source).not.toContain('key: "inlineCode"');
    expect(styles).toContain("cw-format-markdown-protection");
  });

  it("places syntax protection before the explicitly labelled handling modes", () => {
    expect(source).toContain("处理方式");
    expect(source.indexOf("cw-format-markdown-protection"))
      .toBeLessThan(source.indexOf("cw-format-markdown-modes"));
  });

  it("keeps the modal scroll position when a section re-renders", () => {
    expect(source).toContain("private withScrollRestore");
    // Obsidian 的 .modal 本身是滚动容器（overflow: auto），.modal-content 不会滚动；
    // 必须记录并恢复 modalEl 的 scrollTop，否则重渲染后仍会跳回顶部。
    expect(source).toContain("{ el: this.modalEl, scrollTop: this.modalEl.scrollTop }");
    expect(source).toContain("{ el: this.contentEl, scrollTop: this.contentEl.scrollTop }");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("el.scrollTop = Math.min(scrollTop, maxScrollTop)");
    expect(source).toContain("const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);");
    // 复用设置页/写作面板的 scrollTop → 重渲染 → rAF 恢复 模式，不使用固定延时。

    const bodyOf = (name: string): string => {
      const start = Math.max(
        source.indexOf(`private ${name}(`),
        source.indexOf(`private async ${name}(`),
      );
      const next = source.indexOf("\n  private ", start + 1);
      return source.slice(start, next < 0 ? source.length : next);
    };

    // onOpen 首次渲染之后，每个块式重渲染调用（this.renderXSection();）都必须
    // 位于一个尚未被 }); 关闭的 withScrollRestore(() => { 块内。
    // （文件里有 PresetNameModal 的 onClose，需取 FormattingModal 的最后一个。）
    const afterOnClose = source.slice(source.lastIndexOf("onClose(): void"));
    const blockRenderCall = /this\.render(?:Rule|Markdown)Section\(\);/g;
    let match: RegExpExecArray | null;
    while ((match = blockRenderCall.exec(afterOnClose)) !== null) {
      const head = afterOnClose.slice(0, match.index);
      const opener = head.lastIndexOf("withScrollRestore(() => {");
      expect(opener).toBeGreaterThanOrEqual(0);
      expect(afterOnClose.slice(opener, match.index)).not.toContain("});");
    }
    // “调整执行顺序”按钮的整行切换用行内包裹形式。
    expect(source).toContain("withScrollRestore(() => this.renderRuleSection());");
    // 切换方案、移动执行顺序的重渲染同样经过 withScrollRestore。
    for (const method of ["selectPreset", "moveRule"]) {
      expect(bodyOf(method), method).toContain("withScrollRestore");
    }
  });

  it("inherits the custom interface accent on checkbox/radio via shared CSS tokens", () => {
    // Obsidian 用 appearance:none 绘制勾选框，accent-color 是死代码；必须覆盖
    // --checkbox-color 系列变量，且只作用于插件自身作用域，避免污染其他插件/原生弹窗。
    expect(styles).toContain("--checkbox-color: var(--cw-panel-accent);");
    expect(styles).toContain("--checkbox-color-hover: var(--cw-panel-accent-action-hover);");
    expect(styles).toContain(
      "--checkbox-marker-color: var(--cw-panel-accent-contrast, var(--text-on-accent));",
    );
    // 所有插件模态框都从同一个共享 token 块继承重点色。
    for (const modalClass of [
      ".modal.cw-format-modal",
      ".modal.cw-font-picker-modal",
      ".modal.cw-export-modal",
      ".modal.cw-export-preview-modal",
      ".modal.cw-format-batch-modal",
      ".modal.cw-format-batch-confirm-modal",
      ".modal.cw-format-batch-result-modal",
      ".modal.cw-long-image-preview-modal",
      ".cw-settings-page",
      ".cw-panel-view",
    ]) {
      expect(styles).toContain(modalClass);
    }
    // 勾选框的 :checked 背景、radio 选中态与键盘聚焦都跟随重点色。
    expect(styles).toMatch(/input\[type="radio"\]\s*:checked\s*\{[^}]*var\(--cw-panel-accent\)/s);
    expect(styles).toMatch(/input\[type="checkbox"\]\s*:focus-visible[^}]*var\(--cw-panel-accent\)/s);
    // 不再使用每处硬编码的 accent-color 死代码。
    expect(styles).not.toMatch(/\.cw-format-check-option\s+input\s*\{[^}]*accent-color/s);
    expect(styles).not.toMatch(
      /\.cw-settings-page \.cw-settings-rule-checkbox\s+input\[type="checkbox"\]\s*\{[^}]*accent-color/s,
    );
  });
});
