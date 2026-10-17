import { describe, expect, it } from "vitest";
import {
  createUserFontId,
  createUserFontMetadata,
  getUserFontDirectory,
  getUserFontFilePath,
  getUserFontFormat,
  requiredUserFontIds,
} from "../src/user-fonts";

describe("user font files", () => {
  it("accepts supported extensions case-insensitively and rejects other files", () => {
    expect(getUserFontFormat("LXGW.woff2")).toBe("woff2");
    expect(getUserFontFormat("Source.TTF")).toBe("ttf");
    expect(getUserFontFormat("font.otc")).toBeUndefined();
    expect(getUserFontFormat("font")).toBeUndefined();
  });

  it("creates metadata without putting binary data in the record", () => {
    expect(createUserFontMetadata("LXGW WenKai.TTF", "cw-user-test")).toEqual({
      id: "cw-user-test",
      name: "LXGW WenKai",
      fileName: "cw-user-test.ttf",
      originalFileName: "LXGW WenKai.TTF",
      format: "ttf",
    });
  });

  it("creates a unique internal id and keeps user fonts outside the install directory", () => {
    expect(createUserFontId(["cw-user-demo"], "demo")).toBe("cw-user-demo-2");
    expect(getUserFontDirectory(".obsidian", "chinese-writing-layout"))
      .toBe(".obsidian/chinese-writing-layout/fonts");
    expect(getUserFontFilePath(".obsidian/chinese-writing-layout/fonts", "cw-user-test.ttf"))
      .toBe(".obsidian/chinese-writing-layout/fonts/cw-user-test.ttf");
  });
});

describe("lazy user font requirements", () => {
  const fonts = [
    { id: "cw-user-body", name: "Body", fileName: "body.otf", originalFileName: "body.otf", format: "otf" },
    { id: "cw-user-title", name: "Title", fileName: "title.otf", originalFileName: "title.otf", format: "otf" },
    { id: "cw-user-unused", name: "Unused", fileName: "unused.otf", originalFileName: "unused.otf", format: "otf" },
  ] as const;

  it("ignores fonts only registered but not referenced by an open layout", () => {
    const layout = {
      fontFamily: '"cw-user-body", serif',
      headingFontFamily: '"cw-user-title", sans-serif',
      quoteFontFamily: 'inherit',
      boldFontFamily: 'inherit',
      italicFontFamily: 'inherit',
    } as Parameters<typeof requiredUserFontIds>[0];
    expect(requiredUserFontIds(layout, [...fonts])).toEqual(["cw-user-body", "cw-user-title"]);
  });

  it("only uses explicit font overrides when following Obsidian", () => {
    const layout = {
      fontFamily: '"cw-user-body", serif',
      headingFontFamily: '"cw-user-title", sans-serif',
    } as Parameters<typeof requiredUserFontIds>[0];
    expect(requiredUserFontIds(layout, [...fonts], true, {})).toEqual([]);
    expect(requiredUserFontIds(layout, [...fonts], true, { fontFamily: '"cw-user-title", serif' }))
      .toEqual(["cw-user-title"]);
  });
});
