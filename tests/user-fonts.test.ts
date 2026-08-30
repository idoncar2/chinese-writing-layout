import { describe, expect, it } from "vitest";
import {
  createUserFontId,
  createUserFontMetadata,
  getUserFontDirectory,
  getUserFontFilePath,
  getUserFontFormat,
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
