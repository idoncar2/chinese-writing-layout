import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("writing mode integration", () => {
  it("routes activation and layout through the shared resolver", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");

    expect(main).toContain("resolveWritingContext");
    expect(main).toContain("getWritingContextForFile");
    expect(main).toMatch(/isNovelFile[\s\S]*getWritingContextForFile/);
    expect(main).toMatch(/getLayoutPresetIdForFile[\s\S]*getWritingContextForFile/);
    expect(main).toContain("getAllTags");
  });

  it("stores new per-note toggles in plugin data instead of frontmatter", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");

    expect(main).not.toContain("processFrontMatter");
    expect(main).toContain("documentWritingModes[file.path]");
    expect(main).toContain("clearCurrentDocumentWritingMode");
    expect(main).toContain("恢复跟随自动规则");
  });

  it("updates both per-note records across vault lifecycle events", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");

    expect(main).toContain("remapPathKeys");
    expect(main).toContain("deletePathKeys");
    expect(main).toMatch(/documentLayouts[\s\S]*documentWritingModes/);
    expect(main).not.toContain("if (!affected) return;");
  });

  it("refreshes the writing panel when the startup markdown view becomes active", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");

    expect(main).toContain("selectMarkdownView");
    expect(main).toMatch(/active-leaf-change[\s\S]*refreshWritingPanels\(\)/);
    expect(main).toMatch(/file-open[\s\S]*refreshWritingPanels\(\)/);
    expect(main).toContain('getLeavesOfType("markdown")');
  });
});
