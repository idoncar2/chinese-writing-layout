import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/main.ts"), "utf8");

describe("layout preset save integration", () => {
  it("writes the current scope snapshot before selecting the saved preset", () => {
    const start = source.indexOf("async saveCustomLayoutPreset(");
    const end = source.indexOf("async deleteCustomLayoutPreset(", start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const captureIndex = method.indexOf(
      "values: normalizeLayoutPresetValues(this.getCurrentLayoutSettings())",
    );
    const applyIndex = method.indexOf("applySavedLayoutPresetSnapshot");
    const refreshIndex = method.indexOf("await this.saveAndApplySettings();");
    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(applyIndex).toBeGreaterThan(captureIndex);
    expect(refreshIndex).toBeGreaterThan(applyIndex);
    expect(method).toContain("applySavedLayoutPresetSnapshot");
    expect(method).not.toContain("await this.commitSettings();");
  });

  it("refreshes open views as part of the save-and-apply path", () => {
    const start = source.indexOf("async saveAndApplySettings(");
    const end = source.indexOf("previewSettings(", start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain("this.applySettings();");
    expect(method).toContain("this.syncAllViews();");
    expect(method).toContain("this.refreshWritingPanels();");
  });

  it("uses the computed Obsidian font baseline before the plugin default", () => {
    const start = source.indexOf("private captureObsidianLayoutValues(");
    const end = source.indexOf("private captureObsidianRenderedContentWidth(", start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain("const fontFamily = baseline.fontFamily");
    expect(method).not.toContain("|| DEFAULT_SETTINGS.fontFamily");
  });

  it("keeps the measured native content width when saving a Follow Obsidian snapshot", () => {
    const start = source.indexOf("private captureObsidianLayoutValues(");
    const end = source.indexOf("private captureObsidianRenderedContentWidth(", start);
    const method = source.slice(start, end);

    expect(method).toContain("contentWidthPx: renderedWidth?.pixels");
    expect(source).toContain("layout.contentWidthPx");
  });
});
