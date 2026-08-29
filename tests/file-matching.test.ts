import { describe, expect, it } from "vitest";
import {
  deletePathKeys,
  isFileInFolder,
  matchBasenameGlob,
  remapVaultPath,
  remapPathKeys,
} from "../src/file-matching";

describe("isFileInFolder", () => {
  it("matches direct children but only includes descendants when requested", () => {
    expect(isFileInFolder("小说/序章.md", "小说", false)).toBe(true);
    expect(isFileInFolder("小说/第一卷/第一章.md", "小说", false)).toBe(false);
    expect(isFileInFolder("小说/第一卷/第一章.md", "小说", true)).toBe(true);
  });

  it("uses path boundaries instead of matching similar folder prefixes", () => {
    expect(isFileInFolder("小说A/序章.md", "小说", true)).toBe(false);
    expect(isFileInFolder("小说/序章.md", "小说A", true)).toBe(false);
  });

  it("treats the vault root as containing every file", () => {
    expect(isFileInFolder("收集/片段.md", "", false)).toBe(true);
    expect(isFileInFolder("收集/片段.md", "/", true)).toBe(true);
  });
});

describe("matchBasenameGlob", () => {
  it("matches the complete basename and ignores English letter case", () => {
    expect(matchBasenameGlob("Chapter 01", "chapter *")).toBe(true);
    expect(matchBasenameGlob("The Chapter 01", "chapter *")).toBe(false);
    expect(matchBasenameGlob("Chapter 01", "* 01")).toBe(true);
  });

  it("treats only asterisks as wildcards, including consecutive asterisks", () => {
    expect(matchBasenameGlob("第一章·终", "第一**·终")).toBe(true);
    expect(matchBasenameGlob("第一章·终", "第一章?终")).toBe(false);
    expect(matchBasenameGlob("第一章[终]", "第一章[终]")).toBe(true);
    expect(matchBasenameGlob("第一章[终]", "第一章[终")).toBe(false);
    expect(matchBasenameGlob("😀章", "*章")).toBe(true);
    expect(matchBasenameGlob("😀", "*")).toBe(true);
  });

  it("does not match an empty or whitespace-only pattern", () => {
    expect(matchBasenameGlob("Chapter", "")).toBe(false);
    expect(matchBasenameGlob("Chapter", "   ")).toBe(false);
  });
});

describe("path-key helpers", () => {
  it("remaps one selected folder path when an ancestor folder moves", () => {
    expect(remapVaultPath("小说/正文", "小说", "作品")).toBe("作品/正文");
    expect(remapVaultPath("小说A/正文", "小说", "作品")).toBe("小说A/正文");
    expect(remapVaultPath("/", "小说", "作品")).toBe("/");
  });

  it("remaps an exact file key and all descendants of an exact folder prefix", () => {
    const first = { layout: "first" };
    const second = { layout: "second" };
    const third = { layout: "third" };
    const values = {
      "小说/第一章.md": first,
      "小说/卷一/第二章.md": second,
      "小说A/第一章.md": third,
    };

    const remapped = remapPathKeys(values, "小说", "作品");

    expect(remapped).toEqual({
      "作品/第一章.md": first,
      "作品/卷一/第二章.md": second,
      "小说A/第一章.md": third,
    });
    expect(values).toEqual({
      "小说/第一章.md": first,
      "小说/卷一/第二章.md": second,
      "小说A/第一章.md": third,
    });
  });

  it("remaps an exact file key without changing similar paths or values", () => {
    const value = { layout: "chapter" };
    const sibling = { layout: "sibling" };
    const values = {
      "小说/第一章.md": value,
      "小说/第一章.md.bak": sibling,
    };

    expect(remapPathKeys(values, "小说/第一章.md", "作品/第一章.md")).toEqual({
      "作品/第一章.md": value,
      "小说/第一章.md.bak": sibling,
    });
  });

  it("deletes an exact file key and all descendants of an exact folder prefix", () => {
    const values = {
      "小说/第一章.md": "first",
      "小说/卷一/第二章.md": "second",
      "小说A/第一章.md": "similar",
      "其他/第一章.md": "other",
    };

    expect(deletePathKeys(values, "小说")).toEqual({
      "小说A/第一章.md": "similar",
      "其他/第一章.md": "other",
    });
    expect(deletePathKeys(values, "小说/第一章.md")).toEqual({
      "小说/卷一/第二章.md": "second",
      "小说A/第一章.md": "similar",
      "其他/第一章.md": "other",
    });
  });
});
