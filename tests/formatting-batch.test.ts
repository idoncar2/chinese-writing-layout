import { describe, expect, it } from "vitest";
import {
  canRestoreBatchSnapshot,
  isFileInFormattingFolder,
} from "../src/formatting-batch";

describe("isFileInFormattingFolder", () => {
  it("makes the inclusion of subfolders explicit", () => {
    expect(isFileInFormattingFolder("小说/第一卷/第一章.md", "小说", true)).toBe(true);
    expect(isFileInFormattingFolder("小说/第一卷/第一章.md", "小说", false)).toBe(false);
    expect(isFileInFormattingFolder("小说/序章.md", "小说", false)).toBe(true);
  });

  it("allows the vault root to include every Markdown file", () => {
    expect(isFileInFormattingFolder("收集/片段.md", "", true)).toBe(true);
  });

  it("does not treat a similarly named folder as the selected folder", () => {
    expect(isFileInFormattingFolder("小说A/序章.md", "小说", true)).toBe(false);
  });
});

describe("canRestoreBatchSnapshot", () => {
  it("only restores a file that still contains the batch result", () => {
    const snapshot = {
      path: "小说/第一章.md",
      before: "排版前",
      after: "排版后",
    };
    expect(canRestoreBatchSnapshot("排版后", snapshot)).toBe(true);
    expect(canRestoreBatchSnapshot("后来手动修改", snapshot)).toBe(false);
  });
});
