import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const paginationPath = resolve("src/reader/reader-pagination.ts");

describe("reader pagination", () => {
  it("calculates columns and keeps page navigation within bounds", async () => {
    expect(existsSync(paginationPath)).toBe(true);
    if (!existsSync(paginationPath)) return;
    const modulePath = "../src/reader/reader-pagination.ts";
    const pagination = await import(/* @vite-ignore */ modulePath);
    expect(pagination.calculateReaderPageCount(1000, 390, 24)).toBe(3);
    expect(pagination.calculateReaderPageOffset(3, 390, 24)).toBe(828);
    expect(pagination.clampReaderPage(0, 3)).toBe(1);
    expect(pagination.clampReaderPage(8, 3)).toBe(3);
    expect(pagination.clampReaderPage(2, 0)).toBe(1);
  });

  it("maps progress to a valid page after repagination", async () => {
    if (!existsSync(paginationPath)) return;
    const modulePath = "../src/reader/reader-pagination.ts";
    const pagination = await import(/* @vite-ignore */ modulePath);
    expect(pagination.readerPageFromProgress(0, 5)).toBe(1);
    expect(pagination.readerPageFromProgress(0.5, 5)).toBe(3);
    expect(pagination.readerPageFromProgress(1, 5)).toBe(5);
    expect(pagination.readerPageFromProgress(2, 5)).toBe(5);
  });
});
