import { describe, expect, it } from "vitest";
import { formatLayoutSourceStatus } from "../src/layout-source-status";

describe("layout source status", () => {
  it("describes the global default template", () => {
    expect(formatLayoutSourceStatus({ source: "global", presetLabel: "test" }))
      .toBe("跟随全局默认｜test");
  });

  it("describes the template selected by an automatic rule", () => {
    expect(formatLayoutSourceStatus({ source: "rule", presetLabel: "小说正文" }))
      .toBe("自动规则｜小说正文");
  });

  it("describes an independent layout by its base template", () => {
    expect(formatLayoutSourceStatus({
      source: "document",
      presetLabel: "当前自定义设置",
      basePresetLabel: "test",
    })).toBe("当前笔记独立版式｜基于 test");
  });

  it("uses the concise Obsidian label when following Obsidian", () => {
    expect(formatLayoutSourceStatus({ source: "global", presetLabel: "跟随 Obsidian", followsObsidian: true }))
      .toBe("跟随 Obsidian");
  });
});
