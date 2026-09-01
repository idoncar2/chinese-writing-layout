import { describe, expect, it } from "vitest";

import {
  matchesAnyWorkspaceRule,
  matchesWorkspaceRule,
  toWorkspaceApplyRules,
  type WorkspaceFileFacts,
} from "../src/integration/workspace-rules";
import type { AutoApplyRule } from "../src/types";

const facts: WorkspaceFileFacts = {
  path: "小说/塔昼/正文/第十二章.md",
  basename: "第十二章",
  tags: ["#写作"],
  cssClasses: ["scene-romance"],
};

describe("shared workspace rules adapter", () => {
  it("exposes only the shared matcher fields, preserving rule order", () => {
    const rules: AutoApplyRule[] = [
      {
        id: "folder",
        kind: "folder",
        folderPath: "小说/塔昼",
        includeSubfolders: true,
        layoutPreset: "obsidian",
        activateWritingMode: true,
      },
      {
        id: "tag",
        kind: "tag",
        tag: "#写作",
        layoutPreset: "default",
        activateWritingMode: false,
      },
    ];

    expect(toWorkspaceApplyRules(rules)).toEqual([
      { id: "folder", kind: "folder", folderPath: "小说/塔昼", includeSubfolders: true },
      { id: "tag", kind: "tag", tag: "#写作" },
    ]);
  });

  it("uses the same four matcher semantics as automatic layout rules", () => {
    expect(matchesWorkspaceRule(facts, { id: "folder", kind: "folder", folderPath: "小说/塔昼", includeSubfolders: true })).toBe(true);
    expect(matchesWorkspaceRule(facts, { id: "tag", kind: "tag", tag: "写作" })).toBe(true);
    expect(matchesWorkspaceRule(facts, { id: "filename", kind: "filename", pattern: "第*章" })).toBe(true);
    expect(matchesWorkspaceRule(facts, { id: "css", kind: "css-class", cssClass: ".scene-romance" })).toBe(true);
    expect(matchesAnyWorkspaceRule(facts, [{ id: "missing", kind: "folder", folderPath: "其他" }, { id: "css", kind: "css-class", cssClass: "scene-romance" }])).toBe(true);
  });
});
