import type { ExportBlock } from "./text-export";
import { getPrimaryFontName } from "./system-fonts";

export interface DocxExportOptions {
  fontFamily?: string;
  headingFontFamily?: string;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  documentTitle?: string;
  includeTitlePage?: boolean;
  includePageNumbers?: boolean;
  includeHeader?: boolean;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const encoder = new TextEncoder();

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(text: string): string {
  return escapeXml(text).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number): void {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader: number[] = [];
    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, entry.data.length);
    writeUint32(localHeader, entry.data.length);
    writeUint16(localHeader, name.length);
    writeUint16(localHeader, 0);
    const local = joinBytes([new Uint8Array(localHeader), name, entry.data]);
    localParts.push(local);

    const centralHeader: number[] = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, entry.data.length);
    writeUint32(centralHeader, entry.data.length);
    writeUint16(centralHeader, name.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, localOffset);
    centralParts.push(joinBytes([new Uint8Array(centralHeader), name]));
    localOffset += local.length;
  }

  const centralDirectory = joinBytes(centralParts);
  const end: number[] = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, entries.length);
  writeUint16(end, entries.length);
  writeUint32(end, centralDirectory.length);
  writeUint32(end, localOffset);
  writeUint16(end, 0);
  return joinBytes([...localParts, centralDirectory, new Uint8Array(end)]);
}

function createDocumentXml(blocks: readonly ExportBlock[], options: DocxExportOptions): string {
  const fontSizeHalfPoints = Math.max(16, Math.round(options.fontSizePx * 1.5));
  const fontSizePoints = fontSizeHalfPoints / 2;
  const lineTwips = Math.max(
    240,
    Math.round(fontSizePoints * options.lineHeight * 20),
  );
  const spacingTwips = Math.max(
    0,
    Math.round(fontSizePoints * options.paragraphSpacingEm * 20),
  );
  const indentChars = Math.max(0, Math.round(options.firstLineIndentEm * 100));
  const bodyFont = escapeXmlAttribute(getPrimaryFontName(options.fontFamily ?? '"宋体", serif'));
  const headingFont = escapeXmlAttribute(
    getPrimaryFontName(options.headingFontFamily ?? options.fontFamily ?? '"宋体", serif'),
  );
  const run = (
    text: string,
    size = fontSizeHalfPoints,
    bold = false,
    font = bodyFont,
  ): string =>
    `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  const paragraphs: string[] = [];
  if (options.includeTitlePage && options.documentTitle) {
    paragraphs.push(
      `<w:p><w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/><w:spacing w:before="3600" w:after="360"/></w:pPr>${run(options.documentTitle, Math.max(36, fontSizeHalfPoints * 2), true, headingFont)}</w:p>`,
      `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    );
  }
  let pageBreakBefore = false;
  for (const block of blocks) {
    if (block.kind === "page-break") {
      pageBreakBefore = true;
      continue;
    }
    if (block.kind === "blank" || !block.text) continue;
    const pageBreak = pageBreakBefore ? "<w:pageBreakBefore/>" : "";
    pageBreakBefore = false;
    if (block.kind === "heading") {
      const level = Math.min(2, Math.max(1, block.level ?? 1));
      const size = level === 1 ? Math.max(28, fontSizeHalfPoints + 8) : Math.max(24, fontSizeHalfPoints + 4);
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/>${pageBreak}<w:keepNext/><w:spacing w:before="${level === 1 ? 360 : 240}" w:after="180"/></w:pPr>${run(block.text, size, true, headingFont)}</w:p>`,
      );
      continue;
    }
    paragraphs.push(
      `<w:p><w:pPr>${pageBreak}<w:spacing w:line="${lineTwips}" w:lineRule="exact" w:after="${spacingTwips}"/><w:ind w:firstLineChars="${indentChars}"/></w:pPr>${run(block.text)}</w:p>`,
    );
  }

  const headerReference = options.includeHeader ? '<w:headerReference w:type="default" r:id="rId2"/>' : "";
  const footerReference = options.includePageNumbers ? '<w:footerReference w:type="default" r:id="rId3"/>' : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs.join("")}<w:sectPr>${headerReference}${footerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

export function createDocx(
  content: string | readonly ExportBlock[],
  options: DocxExportOptions,
): ArrayBuffer {
  const blocks: ExportBlock[] = typeof content === "string"
    ? content.split(/\r?\n/).map((text) => text
      ? { kind: "paragraph" as const, text }
      : { kind: "blank" as const, text: "" })
    : [...content];
  const includeHeader = options.includeHeader === true;
  const includePageNumbers = options.includePageNumbers === true;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${includeHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}${includePageNumbers ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ""}</Types>`;
  const packageRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${includeHeader ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ""}${includePageNumbers ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ""}</Relationships>`;
  const defaultFont = escapeXmlAttribute(
    getPrimaryFontName(options.fontFamily ?? '"宋体", serif'),
  );
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${defaultFont}" w:hAnsi="${defaultFont}" w:eastAsia="${defaultFont}"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:qFormat/><w:outlineLvl w:val="0"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:qFormat/><w:outlineLvl w:val="1"/></w:style></w:styles>`;
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(packageRels) },
    {
      name: "word/document.xml",
      data: encoder.encode(createDocumentXml(blocks, options)),
    },
    { name: "word/styles.xml", data: encoder.encode(styles) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(documentRels) },
  ];
  if (includeHeader) {
    entries.push({
      name: "word/header1.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${escapeXml(options.documentTitle ?? "作品")}</w:t></w:r></w:p></w:hdr>`),
    });
  }
  if (includePageNumbers) {
    entries.push({
      name: "word/footer1.xml",
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>'),
    });
  }
  const zip = createStoredZip(entries);
  const output = new ArrayBuffer(zip.byteLength);
  new Uint8Array(output).set(zip);
  return output;
}
