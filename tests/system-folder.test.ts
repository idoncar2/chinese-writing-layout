import { describe, expect, it } from "vitest";
import { getVaultFolderPath } from "../src/system-folder";

describe("vault folder paths", () => {
  it("returns the parent folder for nested notes", () => {
    expect(getVaultFolderPath("小说/第一卷/第一章.md")).toBe("小说/第一卷");
  });

  it("returns the vault root for a root-level note", () => {
    expect(getVaultFolderPath("第一章.md")).toBe("");
  });
});
