import type { ExportBlock } from "./text-export";
import type { PaperTheme } from "./types";

export interface ImageExportOptions {
  fontFamily: string;
  headingFontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  paperTheme: PaperTheme;
}

interface DrawLine {
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
}

const PAGE_WIDTH = 1440;
const PAGE_HEIGHT = 2036;
const PAGE_MARGIN_X = 150;
const PAGE_MARGIN_Y = 150;

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  firstWidth: number,
  otherWidth: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const character of Array.from(text)) {
    const candidate = `${current}${character}`;
    const width = lines.length === 0 ? firstWidth : otherWidth;
    if (current && context.measureText(candidate).width > width) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法生成 PNG 图片"));
        return;
      }
      void blob.arrayBuffer().then(resolve, reject);
    }, "image/png");
  });
}

export async function createPngPages(
  blocks: readonly ExportBlock[],
  options: ImageExportOptions,
): Promise<ArrayBuffer[]> {
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  if (!measure) throw new Error("当前环境不支持图片画布");

  const baseSize = Math.max(26, Math.round(options.fontSizePx * 2));
  const lineHeight = Math.round(baseSize * options.lineHeight);
  const paragraphSpacing = Math.round(baseSize * options.paragraphSpacingEm);
  const indent = Math.round(baseSize * options.firstLineIndentEm);
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN_X * 2;
  const pages: DrawLine[][] = [[]];
  let pageIndex = 0;
  let y = PAGE_MARGIN_Y + baseSize;

  const newPage = (): void => {
    if (pages[pageIndex].length === 0) return;
    pages.push([]);
    pageIndex += 1;
    y = PAGE_MARGIN_Y + baseSize;
  };
  const ensureSpace = (height: number): void => {
    if (y + height > PAGE_HEIGHT - PAGE_MARGIN_Y) newPage();
  };

  for (const block of blocks) {
    if (block.kind === "page-break") {
      newPage();
      continue;
    }
    if (block.kind === "blank") {
      y += Math.max(paragraphSpacing, Math.round(lineHeight * 0.35));
      continue;
    }

    const heading = block.kind === "heading";
    const headingSize = (block.level ?? 1) === 1
      ? Math.round(baseSize * 1.55)
      : Math.round(baseSize * 1.28);
    const fontSize = heading ? headingSize : baseSize;
    const fontFamily = heading ? options.headingFontFamily : options.fontFamily;
    const font = `${heading ? "600 " : ""}${fontSize}px ${fontFamily}`;
    measure.font = font;
    const firstIndent = heading ? 0 : indent;
    const wrapped = wrapText(
      measure,
      block.text,
      contentWidth - firstIndent,
      contentWidth,
    );
    const blockLineHeight = Math.round(fontSize * (heading ? 1.45 : options.lineHeight));
    if (heading) y += Math.round(baseSize * 0.5);
    for (const [lineIndex, line] of wrapped.entries()) {
      ensureSpace(blockLineHeight);
      const centered = heading && (block.level ?? 1) === 1;
      pages[pageIndex].push({
        text: line,
        x: centered
          ? PAGE_WIDTH / 2
          : PAGE_MARGIN_X + (lineIndex === 0 ? firstIndent : 0),
        y,
        font,
        align: centered ? "center" : "left",
      });
      y += blockLineHeight;
    }
    y += heading ? Math.round(baseSize * 0.55) : paragraphSpacing;
  }

  const palettes: Record<PaperTheme, { background: string; text: string }> = {
    plain: { background: "#ffffff", text: "#222222" },
    warm: { background: "#fbf6e9", text: "#342f28" },
    cream: { background: "#fffaf0", text: "#3b342a" },
    sepia: { background: "#f1e3c4", text: "#3c2f24" },
    rose: { background: "#fff2f3", text: "#493239" },
    sage: { background: "#edf4ea", text: "#2f3d31" },
    blue: { background: "#edf5fb", text: "#2d3946" },
    dark: { background: "#1d1b19", text: "#ded7c9" },
    custom: { background: "#f8f5ee", text: "#342f28" },
  };
  const palette = palettes[options.paperTheme];
  const results: ArrayBuffer[] = [];
  for (const page of pages) {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境不支持图片画布");
    context.fillStyle = palette.background;
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.fillStyle = palette.text;
    context.textBaseline = "alphabetic";
    for (const line of page) {
      context.font = line.font;
      context.textAlign = line.align;
      context.fillText(line.text, line.x, line.y);
    }
    results.push(await canvasToArrayBuffer(canvas));
  }
  return results;
}
