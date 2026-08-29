import type { ExportBlock } from "./text-export";
import {
  normalizeImageExportWidth,
  type ImageExportWidth,
  type PaperTheme,
} from "./types";

export interface LongImageDeviceBudget {
  maximumCanvasDimension: number;
  maximumPixelArea: number;
}

export const DESKTOP_LONG_IMAGE_BUDGET: LongImageDeviceBudget = {
  maximumCanvasDimension: 32_767,
  maximumPixelArea: 16_000_000,
};

export const MOBILE_LONG_IMAGE_BUDGET: LongImageDeviceBudget = {
  maximumCanvasDimension: 16_384,
  maximumPixelArea: 12_000_000,
};

export function getImageExportDeviceBudget(isMobile: boolean): LongImageDeviceBudget {
  return isMobile ? MOBILE_LONG_IMAGE_BUDGET : DESKTOP_LONG_IMAGE_BUDGET;
}

export interface ImageExportOptions {
  width?: ImageExportWidth;
  layoutViewportWidthPx?: number;
  fontFamily: string;
  headingFontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  paperTheme: PaperTheme;
  centerHeadings?: boolean;
  centerHeadingLevels?: readonly number[];
  deviceBudget?: LongImageDeviceBudget;
}

export interface LongImagePlanOptions extends Omit<ImageExportOptions, "width"> {
  width: ImageExportWidth;
  measureText?: (text: string, font: string) => number;
}

export interface ImageExportMetrics {
  width: ImageExportWidth;
  scale: number;
  marginX: number;
  marginY: number;
  contentWidth: number;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  firstLineIndent: number;
  heading1FontSize: number;
  heading2FontSize: number;
  headingLineHeight: number;
  headingGapBefore: number;
  headingGapAfter: number;
}

export interface LongImageWarning {
  kind: "many-segments" | "paragraph-split";
  message: string;
}

export interface LongImageLine {
  lineNumber: number;
  blockIndex: number;
  kind: "paragraph" | "heading";
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
  sourceIndex?: number;
  sourceTitle?: string;
}

export interface LongImageSegment {
  index: number;
  width: number;
  height: number;
  startLine: number;
  endLine: number;
  startLabel: string;
  endLabel: string;
  firstSentence: string;
  splitInsideParagraph: boolean;
  lines: LongImageLine[];
}

export interface LongImagePlan {
  width: ImageExportWidth;
  maxHeight: number;
  totalContentHeight: number;
  segments: LongImageSegment[];
  warnings: LongImageWarning[];
}

interface LayoutDraftLine {
  lineNumber: number;
  blockIndex: number;
  kind: "paragraph" | "heading";
  text: string;
  font: string;
  fontSize: number;
  x: number;
  align: CanvasTextAlign;
  sourceIndex?: number;
  sourceTitle?: string;
}

type TextExportBlock = Omit<ExportBlock, "kind"> & {
  kind: "paragraph" | "heading";
};

type BlankExportBlock = Omit<ExportBlock, "kind"> & {
  kind: "blank";
};

interface LayoutUnit {
  kind: "paragraph" | "heading" | "blank";
  lines: LayoutDraftLine[];
  before: number;
  after: number;
  height: number;
  bodyHeight: number;
  lineHeight: number;
  fileBoundary: boolean;
  splitInsideParagraph: boolean;
  sourceIndex?: number;
  sourceTitle?: string;
}

const BASE_IMAGE_WIDTH = 1440;
const BASE_MARGIN_X = 150;
const BASE_MARGIN_Y = 150;
const BASE_IMAGE_FONT_MULTIPLIER = 2;
const MOBILE_LAYOUT_MARGIN_X = 24;
const MOBILE_LAYOUT_MARGIN_Y = 32;
const MANY_SEGMENTS_THRESHOLD = 10;

const PAPER_PALETTES: Record<PaperTheme, { background: string; text: string }> = {
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

export function getImageExportScale(width: ImageExportWidth): number {
  return width / BASE_IMAGE_WIDTH;
}

export function getSafeLongImageHeight(
  width: ImageExportWidth,
  budget: LongImageDeviceBudget,
): number {
  return Math.min(
    Math.floor(budget.maximumCanvasDimension),
    Math.floor(budget.maximumPixelArea / width),
  );
}

export function getImageExportMetrics(
  options: Pick<LongImagePlanOptions,
    | "width"
    | "layoutViewportWidthPx"
    | "fontSizePx"
    | "lineHeight"
    | "paragraphSpacingEm"
    | "firstLineIndentEm">,
): ImageExportMetrics {
  const layoutViewportWidth = Number.isFinite(options.layoutViewportWidthPx)
    && (options.layoutViewportWidthPx ?? 0) > 0
    ? options.layoutViewportWidthPx
    : undefined;
  const scale = layoutViewportWidth
    ? options.width / layoutViewportWidth
    : getImageExportScale(options.width);
  const fontSize = Math.max(1, Math.round(
    options.fontSizePx * (layoutViewportWidth ? scale : BASE_IMAGE_FONT_MULTIPLIER * scale),
  ));
  const marginX = Math.max(1, Math.round(
    layoutViewportWidth ? MOBILE_LAYOUT_MARGIN_X * scale : BASE_MARGIN_X * scale,
  ));
  const marginY = Math.max(1, Math.round(
    layoutViewportWidth ? MOBILE_LAYOUT_MARGIN_Y * scale : BASE_MARGIN_Y * scale,
  ));
  return {
    width: options.width,
    scale,
    marginX,
    marginY,
    contentWidth: Math.max(1, options.width - marginX * 2),
    fontSize,
    lineHeight: Math.max(1, Math.round(fontSize * options.lineHeight)),
    paragraphSpacing: Math.max(0, Math.round(fontSize * options.paragraphSpacingEm)),
    firstLineIndent: Math.max(0, Math.round(fontSize * options.firstLineIndentEm)),
    heading1FontSize: Math.max(1, Math.round(fontSize * 1.55)),
    heading2FontSize: Math.max(1, Math.round(fontSize * 1.28)),
    headingLineHeight: Math.max(1, Math.round(fontSize * 1.45)),
    headingGapBefore: Math.max(0, Math.round(fontSize * 0.5)),
    headingGapAfter: Math.max(0, Math.round(fontSize * 0.55)),
  };
}

function defaultMeasureText(text: string, font: string): number {
  const size = Number.parseFloat(font) || 16;
  return Array.from(text).length * size * 0.55;
}

function wrapText(
  text: string,
  firstWidth: number,
  otherWidth: number,
  font: string,
  measureText: (text: string, font: string) => number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const character of Array.from(text)) {
    const candidate = `${current}${character}`;
    const width = lines.length === 0 ? firstWidth : otherWidth;
    if (current && measureText(candidate, font) > width) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function getCenteredHeadingOption(
  options: LongImagePlanOptions,
  level: number,
): boolean {
  if (options.centerHeadings === false) return false;
  if (!options.centerHeadingLevels) return level === 1;
  return options.centerHeadingLevels.includes(level);
}

function createTextUnit(
  block: TextExportBlock,
  blockIndex: number,
  options: LongImagePlanOptions,
  metrics: ImageExportMetrics,
  lineNumberStart: number,
  fileBoundary: boolean,
  measureText: (text: string, font: string) => number,
): LayoutUnit {
  const heading = block.kind === "heading";
  const level = block.level ?? 1;
  const fontSize = heading
    ? (level === 1 ? metrics.heading1FontSize : metrics.heading2FontSize)
    : metrics.fontSize;
  const fontFamily = heading ? options.headingFontFamily : options.fontFamily;
  const font = `${heading ? "600 " : ""}${fontSize}px ${fontFamily}`;
  const centered = heading && getCenteredHeadingOption(options, level);
  const indent = heading ? 0 : metrics.firstLineIndent;
  const lines = wrapText(
    block.text,
    Math.max(1, metrics.contentWidth - indent),
    metrics.contentWidth,
    font,
    measureText,
  ).map((text, index): LayoutDraftLine => ({
    lineNumber: lineNumberStart + index,
    blockIndex,
    kind: block.kind,
    text,
    font,
    fontSize,
    x: centered
      ? metrics.width / 2
      : metrics.marginX + (index === 0 ? indent : 0),
    align: centered ? "center" : "left",
    sourceIndex: block.sourceIndex,
    sourceTitle: block.sourceTitle,
  }));
  const lineHeight = heading ? metrics.headingLineHeight : metrics.lineHeight;
  const before = heading ? metrics.headingGapBefore : 0;
  const after = heading ? metrics.headingGapAfter : metrics.paragraphSpacing;
  return {
    kind: block.kind,
    lines,
    before,
    after,
    bodyHeight: before + lines.length * lineHeight,
    height: before + lines.length * lineHeight + after,
    lineHeight,
    fileBoundary,
    splitInsideParagraph: false,
    sourceIndex: block.sourceIndex,
    sourceTitle: block.sourceTitle,
  };
}

function createBlankUnit(
  block: BlankExportBlock,
  metrics: ImageExportMetrics,
  fileBoundary: boolean,
): LayoutUnit {
  void block;
  const height = Math.max(metrics.paragraphSpacing, Math.round(metrics.lineHeight * 0.35));
  return {
    kind: "blank",
    lines: [],
    before: 0,
    after: 0,
    bodyHeight: height,
    height,
    lineHeight: height,
    fileBoundary,
    splitInsideParagraph: false,
  };
}

function createLayoutUnits(
  blocks: readonly ExportBlock[],
  options: LongImagePlanOptions,
  metrics: ImageExportMetrics,
): LayoutUnit[] {
  const measureText = options.measureText ?? defaultMeasureText;
  const units: LayoutUnit[] = [];
  let nextLineNumber = 1;
  let pendingBoundary = false;
  let pendingSourceIndex: number | undefined;
  let pendingSourceTitle: string | undefined;

  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === "page-break") {
      pendingBoundary = true;
      pendingSourceIndex = block.sourceIndex;
      pendingSourceTitle = block.sourceTitle;
      continue;
    }
    const fileBoundary = pendingBoundary;
    const sourceIndex = block.sourceIndex ?? pendingSourceIndex;
    const sourceTitle = block.sourceTitle ?? pendingSourceTitle;
    const enrichedBlock = sourceIndex === block.sourceIndex && sourceTitle === block.sourceTitle
      ? block
      : { ...block, sourceIndex, sourceTitle };
    const unit = enrichedBlock.kind === "blank"
      ? createBlankUnit(enrichedBlock as BlankExportBlock, metrics, fileBoundary)
      : createTextUnit(
        enrichedBlock as TextExportBlock,
        blockIndex,
        options,
        metrics,
        nextLineNumber,
        fileBoundary,
        measureText,
      );
    nextLineNumber += unit.lines.length;
    units.push(unit);
    pendingBoundary = false;
    pendingSourceIndex = undefined;
    pendingSourceTitle = undefined;
  }
  return units;
}

function getFirstContentUnit(units: readonly LayoutUnit[], index: number): LayoutUnit | undefined {
  for (let next = index + 1; next < units.length; next += 1) {
    if (units[next].kind !== "blank") return units[next];
  }
  return undefined;
}

function trimBlankUnits(units: LayoutUnit[]): LayoutUnit[] {
  const firstContent = units.findIndex((unit) => unit.kind !== "blank");
  if (firstContent < 0) return [];
  let lastContent = units.length - 1;
  while (lastContent >= 0 && units[lastContent].kind === "blank") lastContent -= 1;
  return units.slice(firstContent, lastContent + 1);
}

function splitUnit(
  unit: LayoutUnit,
  contentCapacity: number,
): LayoutUnit[] {
  if (unit.kind !== "paragraph" && unit.kind !== "heading") return [unit];
  const availableLineCount = Math.max(1, Math.floor(
    Math.max(1, contentCapacity - unit.before) / unit.lineHeight,
  ));
  if (unit.lines.length <= availableLineCount) return [unit];
  const chunks: LayoutUnit[] = [];
  for (let index = 0; index < unit.lines.length; index += availableLineCount) {
    const lines = unit.lines.slice(index, index + availableLineCount);
    const first = index === 0;
    const last = index + availableLineCount >= unit.lines.length;
    chunks.push({
      ...unit,
      lines,
      before: first ? unit.before : 0,
      after: last ? unit.after : 0,
      bodyHeight: (first ? unit.before : 0) + lines.length * unit.lineHeight,
      height: (first ? unit.before : 0) + lines.length * unit.lineHeight
        + (last ? unit.after : 0),
      splitInsideParagraph: unit.kind === "paragraph",
    });
  }
  return chunks;
}

function getUnitLabel(unit: LayoutUnit | undefined, fromEnd = false): string {
  if (!unit) return "结尾";
  if (unit.sourceTitle) return unit.sourceTitle;
  const lines = fromEnd ? [...unit.lines].reverse() : unit.lines;
  const text = lines.find((line) => line.text.trim())?.text.trim() ?? "";
  if (!text) return fromEnd ? "结尾" : "开头";
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

function getFirstSentence(lines: readonly LongImageLine[]): string {
  const firstLine = lines[0];
  if (!firstLine) return "";
  let text = "";
  for (const line of lines) {
    if (line.blockIndex !== firstLine.blockIndex) break;
    text += line.text;
    const sentence = text.match(/^.*?(?:……|\.{1,3}|[。！？!?；;])(?:[”’」』）】》])?/u);
    if (sentence?.[0]) return sentence[0];
  }
  return text;
}

function buildSegment(
  index: number,
  units: readonly LayoutUnit[],
  metrics: ImageExportMetrics,
): LongImageSegment | undefined {
  const trimmed = trimBlankUnits([...units]);
  if (trimmed.length === 0) return undefined;
  const lastContentIndex = trimmed.reduce(
    (last, unit, unitIndex) => unit.kind === "blank" ? last : unitIndex,
    -1,
  );
  let cursor = metrics.marginY;
  const lines: LongImageLine[] = [];
  let splitInsideParagraph = false;
  for (const [unitIndex, unit] of trimmed.entries()) {
    if (unit.kind === "blank") {
      cursor += unit.height;
      continue;
    }
    cursor += unit.before;
    for (const line of unit.lines) {
      lines.push({
        lineNumber: line.lineNumber,
        blockIndex: line.blockIndex,
        kind: line.kind,
        text: line.text,
        x: line.x,
        y: cursor + line.fontSize,
        font: line.font,
        align: line.align,
        sourceIndex: line.sourceIndex,
        sourceTitle: line.sourceTitle,
      });
      cursor += unit.lineHeight;
    }
    splitInsideParagraph ||= unit.splitInsideParagraph;
    if (unitIndex !== lastContentIndex) cursor += unit.after;
  }
  const height = Math.ceil(cursor + metrics.marginY);
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  return {
    index,
    width: metrics.width,
    height,
    startLine: firstLine?.lineNumber ?? 0,
    endLine: lastLine?.lineNumber ?? 0,
    startLabel: getUnitLabel(trimmed.find((unit) => unit.kind !== "blank")),
    endLabel: getUnitLabel([...trimmed].reverse().find((unit) => unit.kind !== "blank"), true),
    firstSentence: getFirstSentence(lines),
    splitInsideParagraph,
    lines,
  };
}

function createSegments(
  units: readonly LayoutUnit[],
  metrics: ImageExportMetrics,
  maxHeight: number,
): LongImageSegment[] {
  const contentCapacity = Math.max(1, maxHeight - metrics.marginY * 2);
  const segments: LongImageSegment[] = [];
  let current: LayoutUnit[] = [];
  let currentHeight = 0;

  const flush = (): void => {
    const segment = buildSegment(segments.length + 1, current, metrics);
    if (segment) segments.push(segment);
    current = [];
    currentHeight = 0;
  };

  for (const [unitIndex, originalUnit] of units.entries()) {
    const unit = { ...originalUnit };
    if (unit.kind === "blank" && current.length === 0) continue;

    if (unit.fileBoundary && current.length > 0 && currentHeight >= contentCapacity * 0.72) {
      flush();
    } else if (unit.fileBoundary && current.length > 0) {
      unit.before = Math.max(unit.before, metrics.paragraphSpacing);
      unit.height = unit.bodyHeight + unit.after + unit.before;
    }

    if (unit.kind === "heading" && current.length > 0) {
      const next = getFirstContentUnit(units, unitIndex);
      const nextLineHeight = next?.lines[0]
        ? next.lineHeight
        : 0;
      if (currentHeight + unit.height + nextLineHeight > contentCapacity) flush();
    }

    const fitsWhole = currentHeight + unit.height <= contentCapacity;
    const fitsBody = currentHeight + unit.bodyHeight <= contentCapacity;
    if (fitsWhole || (current.length === 0 && fitsBody)) {
      current.push(unit);
      currentHeight += unit.height;
      continue;
    }

    if (current.length > 0) flush();

    if (unit.kind === "blank") continue;
    const chunks = splitUnit(unit, contentCapacity);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      if (current.length > 0 && currentHeight + chunk.height > contentCapacity) flush();
      current.push(chunk);
      currentHeight += chunk.height;
      if (chunkIndex < chunks.length - 1) flush();
    }
  }
  flush();
  return segments;
}

export function planLongImages(
  blocks: readonly ExportBlock[],
  options: LongImagePlanOptions,
): LongImagePlan {
  const metrics = getImageExportMetrics(options);
  const budget = options.deviceBudget ?? getImageExportDeviceBudget(false);
  const maxHeight = getSafeLongImageHeight(options.width, budget);
  if (maxHeight <= metrics.marginY * 2) {
    throw new Error("当前设备的长图安全高度不足以容纳版式留白");
  }
  const units = createLayoutUnits(blocks, options, metrics);
  const segments = createSegments(units, metrics, maxHeight);
  const warnings: LongImageWarning[] = [];
  if (segments.length > MANY_SEGMENTS_THRESHOLD) {
    warnings.push({
      kind: "many-segments",
      message: `预计生成 ${segments.length} 张长图。内容较长，导出可能耗时并占用较多存储空间。`,
    });
  }
  if (segments.some((segment) => segment.splitInsideParagraph)) {
    warnings.push({
      kind: "paragraph-split",
      message: "部分超长段落会在行间切分。",
    });
  }
  return {
    width: options.width,
    maxHeight,
    totalContentHeight: segments.reduce((total, segment) => total + segment.height, 0),
    segments,
    warnings,
  };
}

function getThemeColor(variable: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return value || fallback;
}

function getPaperPalette(theme: PaperTheme): { background: string; text: string } {
  const fallback = PAPER_PALETTES[theme];
  if (theme !== "plain") return fallback;
  return {
    background: getThemeColor("--background-primary", fallback.background),
    text: getThemeColor("--text-normal", fallback.text),
  };
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

export async function createLongImagePlan(
  blocks: readonly ExportBlock[],
  options: ImageExportOptions,
): Promise<LongImagePlan> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  if (!measure) throw new Error("当前环境不支持图片画布");
  const width = normalizeImageExportWidth(options.width);
  return planLongImages(blocks, {
    ...options,
    width,
    measureText: (text, font) => {
      measure.font = font;
      return measure.measureText(text).width;
    },
  });
}

export async function renderLongImageSegment(
  segment: LongImageSegment,
  options: ImageExportOptions,
): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = segment.width;
  canvas.height = segment.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前环境不支持图片画布");
  const palette = getPaperPalette(options.paperTheme);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, segment.width, segment.height);
  context.fillStyle = palette.text;
  context.textBaseline = "alphabetic";
  for (const line of segment.lines) {
    context.font = line.font;
    context.textAlign = line.align;
    context.fillText(line.text, line.x, line.y);
  }
  try {
    return await canvasToArrayBuffer(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function yieldLongImageExport(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(resolve, 0);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Compatibility wrapper for callers that still expect the old array-returning API.
 * New exports should use createLongImagePlan and renderLongImageSegment sequentially.
 */
export async function createPngPages(
  blocks: readonly ExportBlock[],
  options: ImageExportOptions,
): Promise<ArrayBuffer[]> {
  const plan = await createLongImagePlan(blocks, options);
  const results: ArrayBuffer[] = [];
  for (const segment of plan.segments) {
    results.push(await renderLongImageSegment(segment, options));
    await yieldLongImageExport();
  }
  return results;
}
