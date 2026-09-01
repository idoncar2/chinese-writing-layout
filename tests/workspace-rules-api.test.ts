import { describe, expect, it, vi } from "vitest";

import {
  createWritingLayoutModuleApi,
  registerWritingModule,
  type WritingToolsGlobal,
} from "../src/integration/module-api";

describe("Chinese Writing Layout workspace rules API", () => {
  it("registers a versioned read-only module and announces its lifecycle", () => {
    const host = new EventTarget() as EventTarget & WritingToolsGlobal;
    const listener = vi.fn();
    host.addEventListener("writing-tools:modules-changed", listener);
    const api = createWritingLayoutModuleApi({
      moduleVersion: "1.0.2",
      getCurrentWritingContext: () => null,
      subscribe: () => () => undefined,
      openStudio: () => undefined,
      openFormatting: () => undefined,
      openExport: () => undefined,
      workspaceRules: {
        protocolVersion: 1,
        getWorkspaceRules: () => [{ id: "folder", kind: "folder", folderPath: "正文" }],
        subscribe: () => () => undefined,
      },
    });

    const cleanup = registerWritingModule(host, api);
    expect(host.__writingToolsModules?.["chinese-writing-layout"]).toBe(api);
    expect(api.workspaceRules?.getWorkspaceRules()).toEqual([
      { id: "folder", kind: "folder", folderPath: "正文" },
    ]);
    cleanup();
    expect(host.__writingToolsModules?.["chinese-writing-layout"]).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
