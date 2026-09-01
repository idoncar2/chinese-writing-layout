import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");

describe("writing layout module lifecycle", () => {
  it("registers after startup and unregisters before plugin teardown", () => {
    expect(mainSource).toContain('from "./integration/module-api"');
    expect(mainSource).toContain("this.registerModuleApi()");
    expect(mainSource).toContain("this.unregisterModule?.()");
    expect(mainSource).toContain("this.writingContextListeners.clear()");
  });

  it("exposes summaries and UI entry points without leaking settings", () => {
    expect(mainSource).toContain("getCurrentWritingContextSummary");
    expect(mainSource).toContain("openWritingPanel(false)");
    expect(mainSource).toContain("openFormattingModal()");
    expect(mainSource).toContain("openExportModal()");
    expect(mainSource).not.toContain("getSettings: () => this.settings");
  });
});
