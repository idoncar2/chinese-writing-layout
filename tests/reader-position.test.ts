import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const positionPath = resolve("src/reader/reader-position.ts");

describe("reader position", () => {
  it("creates stable block hashes and resolves a moved block by hash first", async () => {
    expect(existsSync(positionPath)).toBe(true);
    if (!existsSync(positionPath)) return;
    const modulePath = "../src/reader/reader-position.ts";
    const readerPosition = await import(/* @vite-ignore */ modulePath);
    const blocks = readerPosition.createReaderBlockDescriptors([
      { textContent: "第一段正文" },
      { textContent: "第二段正文" },
      { textContent: "第三段正文" },
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].hash).not.toBe(blocks[1].hash);
    expect(readerPosition.resolveReaderBlockIndex(
      [blocks[0], blocks[2]],
      { blockIndex: 1, blockHash: blocks[2].hash, textOffset: 0, documentProgress: 0.5 },
    )).toBe(1);
    expect(readerPosition.resolveReaderBlockIndex(
      blocks,
      { blockIndex: 2, blockHash: "missing", textOffset: 0, documentProgress: 0.5 },
    )).toBe(2);
  });

  it("normalizes persisted positions and clamps progress", async () => {
    if (!existsSync(positionPath)) return;
    const modulePath = "../src/reader/reader-position.ts";
    const readerPosition = await import(/* @vite-ignore */ modulePath);
    expect(readerPosition.normalizeReaderPositions({
      "正文/第一章.md": {
        anchor: {
          blockIndex: -4,
          blockHash: "abc",
          textOffset: -2,
          documentProgress: 4,
        },
        updatedAt: -1,
      },
      invalid: { anchor: null },
    })).toEqual({
      "正文/第一章.md": {
        anchor: {
          blockIndex: 0,
          blockHash: "abc",
          textOffset: 0,
          documentProgress: 1,
        },
        updatedAt: 0,
      },
    });
  });
});
