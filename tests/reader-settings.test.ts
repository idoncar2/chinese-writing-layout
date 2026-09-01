import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/types";

const constantsPath = resolve("src/reader/reader-constants.ts");

describe("reader settings", () => {
  it("provides independent reader defaults", async () => {
    expect(existsSync(constantsPath)).toBe(true);
    const settings = DEFAULT_SETTINGS as typeof DEFAULT_SETTINGS & {
      readerSettings?: Record<string, unknown>;
      readerPositions?: Record<string, unknown>;
    };
    expect(settings.readerSettings).toEqual({
      font: { source: "obsidian", id: "text" },
      fontSize: 18,
      lineHeight: 1.9,
      paragraphSpacing: 0.8,
      contentWidth: 720,
      pagePadding: 40,
      background: "warm",
    });
    expect(settings.readerPositions).toEqual({});
  });

  it("normalizes unsafe values without borrowing writing layout settings", async () => {
    if (!existsSync(constantsPath)) return;
    const modulePath = "../src/reader/reader-constants.ts";
    const readerConstants = await import(/* @vite-ignore */ modulePath);
    expect(readerConstants.normalizeReaderSettings({
      font: { source: "inherit", id: "body" },
      fontSize: 100,
      lineHeight: 0,
      paragraphSpacing: -1,
      contentWidth: 1,
      pagePadding: 999,
      background: "invalid",
    })).toEqual({
      font: { source: "obsidian", id: "text" },
      fontSize: 30,
      lineHeight: 1.4,
      paragraphSpacing: 0,
      contentWidth: 520,
      pagePadding: 80,
      background: "warm",
    });
  });
});
