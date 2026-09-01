import { describe, expect, it, vi } from "vitest";
import type { WritingToolsGlobal } from "../src/integration/module-api";

describe("writing layout module API", () => {
  it("publishes a stable DTO-only context and explicit UI capabilities", async () => {
    let integration: typeof import("../src/integration/module-api");
    try {
      integration = await import("../src/integration/module-api");
    } catch {
      expect.fail("writing layout module API is not implemented");
      return;
    }

    const context = {
      filePath: "小说/第一章.md",
      enabled: true,
      layoutPreset: "default",
      layoutLabel: "推荐写作版式",
      activationSource: "rule",
      layoutSource: "rule",
    } as const;
    const api = integration.createWritingLayoutModuleApi({
      moduleVersion: "1.0.2",
      getCurrentWritingContext: () => context,
      subscribe: () => () => undefined,
      openStudio: vi.fn(),
      openFormatting: vi.fn(),
      openExport: vi.fn(),
    });

    expect(api.meta).toEqual({
      moduleId: "chinese-writing-layout",
      moduleVersion: "1.0.2",
      protocolVersion: 1,
      capabilities: [
        "writing-context.read",
        "writing-context.subscribe",
        "workspace.rules.read",
        "workspace.rules.subscribe",
        "views.open",
        "formatting.open",
        "export.open",
      ],
    });
    expect(api.getCurrentWritingContext()).toEqual(context);
    expect(api.getCurrentWritingContext()).not.toBe(context);
  });

  it("registers replacement-safely and announces module changes", async () => {
    let integration: typeof import("../src/integration/module-api");
    try {
      integration = await import("../src/integration/module-api");
    } catch {
      expect.fail("writing layout module registry is not implemented");
      return;
    }

    const host = new EventTarget() as EventTarget & WritingToolsGlobal;
    const changes = vi.fn();
    host.addEventListener(integration.WRITING_TOOLS_MODULES_CHANGED_EVENT, changes);
    const api = integration.createWritingLayoutModuleApi({
      moduleVersion: "1.0.2",
      getCurrentWritingContext: () => null,
      subscribe: () => () => undefined,
      openStudio: vi.fn(),
      openFormatting: vi.fn(),
      openExport: vi.fn(),
    });
    const replacement = { ...api };

    const unregisterOld = integration.registerWritingModule(host, api);
    const unregisterNew = integration.registerWritingModule(host, replacement);
    unregisterOld();

    expect(host.__writingToolsModules?.["chinese-writing-layout"]).toBe(replacement);
    expect(changes).toHaveBeenCalledTimes(2);

    unregisterNew();
    expect(host.__writingToolsModules?.["chinese-writing-layout"]).toBeUndefined();
    expect(changes).toHaveBeenCalledTimes(3);
  });
});
