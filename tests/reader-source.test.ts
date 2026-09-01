import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = resolve("src/reader/reader-source.ts");

describe("reader source resolver", () => {
  it("uses the still-open editor before cached vault content", async () => {
    expect(existsSync(sourcePath)).toBe(true);
    if (!existsSync(sourcePath)) return;
    const modulePath = "../src/reader/reader-source.ts";
    const readerSource = await import(/* @vite-ignore */ modulePath);
    let cachedReads = 0;
    const content = await readerSource.resolveReaderSource(
      "正文/第一章.md",
      { file: { path: "正文/第一章.md" }, editor: { getValue: () => "编辑器最新内容" } },
      async () => {
        cachedReads += 1;
        return "磁盘旧内容";
      },
    );
    expect(content).toBe("编辑器最新内容");
    expect(cachedReads).toBe(0);
  });

  it("falls back to cached content when the source editor is unavailable", async () => {
    if (!existsSync(sourcePath)) return;
    const modulePath = "../src/reader/reader-source.ts";
    const readerSource = await import(/* @vite-ignore */ modulePath);
    const content = await readerSource.resolveReaderSource(
      "正文/第一章.md",
      { file: { path: "其他.md" }, editor: { getValue: () => "不应读取" } },
      async () => "缓存内容",
    );
    expect(content).toBe("缓存内容");
  });
});
