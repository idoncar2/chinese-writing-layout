import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(resolve("src/export-modal.ts"), "utf8");
const previewSource = readFileSync(resolve("src/long-image-preview-modal.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const imageSource = readFileSync(resolve("src/image-export.ts"), "utf8");
const typesSource = readFileSync(resolve("src/types.ts"), "utf8");
const textExportSource = readFileSync(resolve("src/text-export.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("long image export UI and integration", () => {
  it("exposes the long image resolution controls and preflight action", () => {
    expect(modalSource).toContain("长图（.png）");
    expect(modalSource).toContain("长图设置");
    expect(modalSource).toContain("imageExportWidth");
    expect(modalSource).toContain("预览分图");
    expect(previewSource).toContain("长图分图预览");
    expect(previewSource).toContain("开始导出");
    expect(previewSource).toContain("第一句话");
  });

  it("connects preflight and export to the same planner", () => {
    expect(mainSource).toContain("createLongImagePlan");
    expect(mainSource).toContain("renderLongImageSegment");
    expect(mainSource).toContain("longImagePlan");
    expect(modalSource).toContain("正在生成");
    expect(mainSource).toContain("第${index + 1}张");
    expect(imageSource).toContain("maximumPixelArea");
    expect(imageSource).toContain("document.fonts.ready");
    expect(mainSource).toContain("getMobileImageLayoutViewportWidth");
    expect(mainSource).toContain("layoutViewportWidthPx");
    expect(imageSource).toContain("MOBILE_LAYOUT_MARGIN_X");
  });

  it("keeps mobile layout sizing independent from browser-only viewport APIs", () => {
    expect(mainSource).toContain("MOBILE_IMAGE_LAYOUT_VIEWPORT_WIDTH");
    expect(mainSource).not.toContain("window.visualViewport");
    expect(modalSource).toContain("按稳定的手机阅读宽度排版");
    expect(modalSource).not.toContain("按当前手机编辑区宽度排版");
  });

  it("keeps resolution as normalized plugin data and records source metadata", () => {
    expect(typesSource).toContain("ImageExportWidth");
    expect(typesSource).toContain("imageExportWidth");
    expect(typesSource).toContain("imageExportWidth: 1440");
    expect(textExportSource).toContain("sourceIndex?");
    expect(textExportSource).toContain("sourceTitle?");
  });

  it("uses scoped, theme-aware responsive long image styles", () => {
    expect(styles).toContain(".cw-export-long-image-options");
    expect(styles).toContain(".cw-long-image-preview-modal");
    expect(styles).toContain("var(--background-modifier-border)");
    expect(styles).toContain("var(--text-muted)");
    expect(styles).toContain("@media (max-width: 500px)");
  });
});
