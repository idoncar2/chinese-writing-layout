import { describe, expect, it } from "vitest";
import { createDocx } from "../src/docx-export";

function listStoredZipEntries(buffer: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const endOffset = bytes.length - 22;
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, string>();

  for (let index = 0; index < entryCount; index += 1) {
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    const size = view.getUint32(centralOffset + 24, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(
      bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength),
    );
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, decoder.decode(bytes.slice(dataOffset, dataOffset + size)));
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("createDocx", () => {
  it("creates a valid stored ZIP package with Word document parts", () => {
    const result = createDocx("第一段 & 第二段\n下一段。", {
      fontSizePx: 18,
      lineHeight: 1.9,
      paragraphSpacingEm: 0.5,
      firstLineIndentEm: 2,
    });
    const entries = listStoredZipEntries(result);
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.has("_rels/.rels")).toBe(true);
    expect(entries.has("word/document.xml")).toBe(true);
    expect(entries.has("word/styles.xml")).toBe(true);
    expect(entries.get("word/document.xml")).toContain("第一段 &amp; 第二段");
    expect(entries.get("word/document.xml")).toContain('w:firstLineChars="200"');
    expect(entries.get("word/document.xml")).toContain('w:lineRule="exact"');
  });

  it("exports headings, title page, header, and page numbers", () => {
    const result = createDocx([
      { kind: "heading", level: 1, text: "第一章" },
      { kind: "paragraph", text: "正文。" },
    ], {
      fontFamily: '"霞鹜文楷", serif',
      headingFontFamily: '"方正小标宋", serif',
      fontSizePx: 18,
      lineHeight: 1.9,
      paragraphSpacingEm: 0.5,
      firstLineIndentEm: 2,
      documentTitle: "测试作品",
      includeTitlePage: true,
      includeHeader: true,
      includePageNumbers: true,
    });
    const entries = listStoredZipEntries(result);
    expect(entries.get("word/document.xml")).toContain('w:pStyle w:val="Heading1"');
    expect(entries.get("word/document.xml")).toContain('w:eastAsia="霞鹜文楷"');
    expect(entries.get("word/document.xml")).toContain('w:eastAsia="方正小标宋"');
    expect(entries.get("word/document.xml")).toContain("测试作品");
    expect(entries.has("word/header1.xml")).toBe(true);
    expect(entries.has("word/footer1.xml")).toBe(true);
    expect(entries.get("word/footer1.xml")).toContain(" PAGE ");
  });
});
