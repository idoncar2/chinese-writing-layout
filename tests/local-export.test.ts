import { describe, expect, it } from "vitest";
import {
  getAvailableLocalExportPath,
  getAvailableLocalImageExportTarget,
  getLocalExportDirectory,
  normalizeLocalExportPath,
} from "../src/local-export";

describe("local export paths", () => {
  it("keeps the selected local path and appends the extension", () => {
    expect(normalizeLocalExportPath("C:\\Exports\\作品", "png")).toBe(
      "C:\\Exports\\作品.png",
    );
    expect(getLocalExportDirectory("C:\\Exports\\作品.png")).toBe(
      "C:\\Exports",
    );
  });

  it("avoids overwriting a single local file", () => {
    const existing = new Set(["C:\\Exports\\作品.txt"]);

    expect(
      getAvailableLocalExportPath(
        "C:\\Exports\\作品.txt",
        "txt",
        (path) => existing.has(path),
      ),
    ).toBe("C:\\Exports\\作品 (1).txt");
  });

  it("reserves the whole local PNG group when resolving a collision", () => {
    const existing = new Set(["C:\\Exports\\作品-第1张.png"]);

    expect(
      getAvailableLocalImageExportTarget(
        "C:\\Exports\\作品.png",
        (path) => existing.has(path),
      ),
    ).toEqual({ directory: "C:\\Exports", baseName: "作品 (1)" });
  });

  it("supports slash-separated local paths", () => {
    expect(normalizeLocalExportPath("D:/Exports/稿件.md", "md")).toBe(
      "D:/Exports/稿件.md",
    );
    expect(getLocalExportDirectory("D:/Exports/稿件.md")).toBe("D:/Exports");
  });
});
