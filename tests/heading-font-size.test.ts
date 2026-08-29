import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("heading font size is decoupled from the body font size", () => {
  it("captures the theme heading sizes into px plugin variables", () => {
    // 插件把主题标题档位解析成 px 写入 --cw-hN-size，供 CSS 钉住标题字号。
    expect(mainSource).toContain("readObsidianHeadingSizes");
    expect(mainSource).toContain("private applyHeadingSizeVariables");
    const start = mainSource.indexOf("private applyHeadingSizeVariables");
    const next = mainSource.indexOf("\n  private ", start + 1);
    const body = mainSource.slice(start, next < 0 ? mainSource.length : next);
    for (const [key, variable] of [
      ["h1", "--cw-h1-size"],
      ["h2", "--cw-h2-size"],
      ["h3", "--cw-h3-size"],
      ["h4", "--cw-h4-size"],
      ["h5", "--cw-h5-size"],
      ["h6", "--cw-h6-size"],
      ["inline-title", "--cw-inline-title-size"],
    ] as const) {
      expect(body, variable).toContain(`apply("${key}", "${variable}")`);
      expect(body, variable).toContain(`target.style.setProperty(variable, \`\${px}px\`)`);
    }
    // 解析不了的档位要移除变量，让 CSS 回退到原生 var(--hN-size)。
    expect(body).toContain("target.style.removeProperty(variable)");
  });

  it("writes the heading variables in both custom and follow-with-override layouts", () => {
    // 自定义排版：正文字号总是写入，标题档位紧随其后。
    // 用 \r?\n 兼容 git autocrlf 导致的 CRLF/LF 差异。
    expect(mainSource).toMatch(
      /    target\.style\.setProperty\("--cw-font-size", `\$\{layout\.fontSize\}px`\);\r?\n    this\.applyHeadingSizeVariables\(target\);/u,
    );
    // 跟随 Obsidian 且用户改了正文字号：同样要钉住标题，否则标题会一起放大。
    const followStart = mainSource.indexOf("if (overrides.fontSize !== undefined) {");
    const followEnd = mainSource.indexOf("\n      }", followStart);
    const follow = mainSource.slice(followStart, followEnd < 0 ? mainSource.length : followEnd);
    expect(follow).toContain("this.applyHeadingSizeVariables(target);");
    // 跟随模式未改正文字号时不应写标题变量（CSS 侧同样只在 override 类下生效）。
    expect(follow).toContain("target.style.setProperty(\"--cw-font-size\"");
  });

  it("pins heading sizes to theme px in custom layout for edit, live-preview, and reading", () => {
    // 编辑/实时预览用 .HyperMD-header-N，阅读视图用 hN 和 .inline-title。
    // 每个档位是两个选择器共用一条声明，hN 位于阅读视图选择器末尾（带逗号）。
    for (const level of ["1", "2", "3", "4", "5", "6"]) {
      expect(styles, `reading h${level}`).toContain(
        `.cw-novel-enabled:not(.cw-follow-obsidian) .markdown-preview-view h${level},`,
      );
      expect(styles, `edit h${level}`).toContain(
        `.cw-novel-enabled:not(.cw-follow-obsidian) .markdown-source-view.mod-cm6 .HyperMD-header-${level} { font-size: var(--cw-h${level}-size, var(--h${level}-size)); }`,
      );
    }
    expect(styles).toContain(
      ".cw-novel-enabled:not(.cw-follow-obsidian) .inline-title { font-size: var(--cw-inline-title-size, var(--inline-title-size)); }",
    );
  });

  it("pins heading sizes in follow mode too when the user overrides the body font", () => {
    for (const level of ["1", "2", "3", "4", "5", "6"]) {
      expect(styles, `follow reading h${level}`).toContain(
        `.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-font-size .markdown-preview-view h${level},`,
      );
      expect(styles, `follow edit h${level}`).toContain(
        `.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-font-size .markdown-source-view.mod-cm6 .HyperMD-header-${level} { font-size: var(--cw-h${level}-size, var(--h${level}-size)); }`,
      );
    }
    expect(styles).toContain(
      ".cw-novel-enabled.cw-follow-obsidian.cw-follow-override-font-size .inline-title { font-size: var(--cw-inline-title-size, var(--inline-title-size)); }",
    );
  });

  it("never hardcodes a px heading size in CSS; values come only from theme-derived variables", () => {
    // 标题字号一律走 var(--cw-hN-size, var(--hN-size))，不允许写死 20px / 24px 之类。
    const start = styles.indexOf("/* 标题字号与正文字号解耦。");
    const endMarker =
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-font-size .inline-title { font-size: var(--cw-inline-title-size, var(--inline-title-size)); }";
    const end = styles.indexOf(endMarker, start) + endMarker.length;
    const pinningBlock = styles.slice(start, end);
    expect(pinningBlock).toContain("var(--cw-h1-size, var(--h1-size))");
    expect(pinningBlock).not.toMatch(/font-size:\s*\d+\.?\d*px/u);
  });
});
