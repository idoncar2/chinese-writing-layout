import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageExportMetrics,
  getImageExportScale,
  getSafeLongImageHeight,
  planLongImages,
  renderLongImageSegment,
  type LongImagePlanOptions,
} from "../src/image-export";
import { normalizeImageExportWidth } from "../src/types";

function options(
  overrides: Partial<LongImagePlanOptions> = {},
): LongImagePlanOptions {
  return {
    width: 1440,
    fontFamily: "serif",
    headingFontFamily: "sans-serif",
    fontSizePx: 18,
    lineHeight: 1.5,
    paragraphSpacingEm: 0.5,
    firstLineIndentEm: 2,
    paperTheme: "plain",
    measureText: (text) => text.length * 10,
    deviceBudget: {
      maximumCanvasDimension: 5000,
      maximumPixelArea: 1440 * 5000,
    },
    ...overrides,
  };
}

describe("long image planning", () => {
  it("normalizes supported resolutions and falls back for old values", () => {
    expect(normalizeImageExportWidth(1080)).toBe(1080);
    expect(normalizeImageExportWidth(1440)).toBe(1440);
    expect(normalizeImageExportWidth(2160)).toBe(2160);
    expect(normalizeImageExportWidth(2036)).toBe(1440);
    expect(normalizeImageExportWidth(undefined)).toBe(1440);
  });

  it("scales the complete layout from the 1440px design baseline", () => {
    expect(getImageExportScale(1080)).toBe(0.75);
    expect(getImageExportScale(2160)).toBe(1.5);

    const standard = getImageExportMetrics(options({ width: 1080 }));
    const baseline = getImageExportMetrics(options({ width: 1440 }));
    const ultra = getImageExportMetrics(options({ width: 2160 }));
    expect(standard.fontSize).toBe(27);
    expect(baseline.fontSize).toBe(36);
    expect(ultra.fontSize).toBe(54);
    expect(standard.marginX / baseline.marginX).toBeCloseTo(0.75);
    expect(ultra.lineHeight / baseline.lineHeight).toBeCloseTo(1.5);
    expect(standard.firstLineIndent / baseline.firstLineIndent).toBeCloseTo(0.75);
  });

  it("uses the mobile viewport as the layout width while keeping export resolution independent", () => {
    const standard = getImageExportMetrics(options({
      width: 1080,
      layoutViewportWidthPx: 360,
    }));
    const ultra = getImageExportMetrics(options({
      width: 2160,
      layoutViewportWidthPx: 360,
    }));

    expect(standard.scale).toBe(3);
    expect(ultra.scale).toBe(6);
    expect(standard.fontSize).toBe(54);
    expect(ultra.fontSize).toBe(108);
    expect(standard.contentWidth / standard.scale).toBe(312);
    expect(ultra.contentWidth / ultra.scale).toBe(312);
  });

  it("calculates safe height from both canvas limits", () => {
    expect(getSafeLongImageHeight(1080, {
      maximumCanvasDimension: 1000,
      maximumPixelArea: 1_000_000,
    })).toBe(925);
  });

  it("keeps a short article in one naturally cropped segment", () => {
    const plan = planLongImages([
      { kind: "paragraph", text: "一段短文。" },
    ], options());
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].height).toBeLessThan(plan.maxHeight);
    expect(plan.segments[0].splitInsideParagraph).toBe(false);
  });

  it("splits between ordinary paragraphs without splitting them", () => {
    const plan = planLongImages(
      Array.from({ length: 6 }, (_, index) => ({
        kind: "paragraph" as const,
        text: `${index + 1}${"正文".repeat(80)}`,
      })),
      options({
        deviceBudget: {
          maximumCanvasDimension: 500,
          maximumPixelArea: 1440 * 500,
        },
      }),
    );
    expect(plan.segments.length).toBeGreaterThan(1);
    expect(plan.segments.every((segment) => !segment.splitInsideParagraph)).toBe(true);
    expect(plan.segments.every((segment) => segment.height <= plan.maxHeight)).toBe(true);
  });

  it("only splits inside a paragraph when that paragraph cannot fit", () => {
    const plan = planLongImages([
      { kind: "paragraph", text: "长段落".repeat(600) },
    ], options({
      deviceBudget: {
        maximumCanvasDimension: 500,
        maximumPixelArea: 1440 * 500,
      },
    }));
    expect(plan.segments.length).toBeGreaterThan(1);
    expect(plan.segments.some((segment) => segment.splitInsideParagraph)).toBe(true);
    expect(plan.segments.every((segment) => segment.height <= plan.maxHeight)).toBe(true);
  });

  it("does not leave a heading as the final line of a segment", () => {
    const plan = planLongImages([
      { kind: "paragraph", text: "前文".repeat(130) },
      { kind: "heading", level: 1, text: "下一章" },
      { kind: "paragraph", text: "章节正文" },
    ], options({
      deviceBudget: {
        maximumCanvasDimension: 500,
        maximumPixelArea: 1440 * 500,
      },
    }));
    expect(plan.segments.every((segment) => segment.lines.at(-1)?.kind !== "heading")).toBe(true);
  });

  it("treats page breaks as soft file boundaries for long images", () => {
    const plan = planLongImages([
      { kind: "paragraph", text: "第一篇正文" },
      { kind: "page-break", text: "" },
      { kind: "paragraph", text: "第二篇正文" },
    ], options());
    expect(plan.segments).toHaveLength(1);
  });

  it("prefers source titles for segment range labels", () => {
    const plan = planLongImages([
      { kind: "paragraph", text: "第一篇正文", sourceIndex: 0, sourceTitle: "第一章" },
      { kind: "page-break", text: "", sourceIndex: 1, sourceTitle: "第二章" },
      { kind: "paragraph", text: "第二篇正文", sourceIndex: 1, sourceTitle: "第二章" },
    ], options());
    expect(plan.segments[0].startLabel).toBe("第一章");
    expect(plan.segments[0].endLabel).toBe("第二章");
  });

  it("records the first sentence that appears on every image segment", () => {
    const plan = planLongImages([
      {
        kind: "paragraph",
        text: "这是这一张图片的第一句话。这里是第二句话，预览不应显示到这里。",
      },
    ], options());
    expect(plan.segments[0].firstSentence).toBe("这是这一张图片的第一句话。");
  });

  it("warns without blocking when the plan contains more than ten segments", () => {
    const plan = planLongImages(
      Array.from({ length: 12 }, () => ({ kind: "paragraph" as const, text: "短段落" })),
      options({
        deviceBudget: {
          maximumCanvasDimension: 360,
          maximumPixelArea: 1440 * 360,
        },
      }),
    );
    expect(plan.segments.length).toBeGreaterThan(10);
    expect(plan.warnings.some((warning) => warning.message.includes("预计生成"))).toBe(true);
  });
});

describe("long image rendering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the selected custom paper image under the same translucent paper overlay as the UI", async () => {
    const operations: Array<{ kind: string; value?: unknown }> = [];
    const fillStyles: string[] = [];
    let currentFillStyle = "";
    const image = {
      naturalWidth: 800,
      naturalHeight: 400,
      onload: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      set src(value: string) {
        operations.push({ kind: "load-image", value });
        this.onload?.();
      },
    };
    const context = {
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(value: string) {
        currentFillStyle = value;
        fillStyles.push(value);
      },
      textBaseline: "",
      textAlign: "",
      font: "",
      fillRect: (...args: unknown[]) => operations.push({ kind: "fill-rect", value: args }),
      drawImage: (...args: unknown[]) => operations.push({ kind: "draw-image", value: args }),
      fillText: (...args: unknown[]) => operations.push({ kind: "fill-text", value: args }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
    };
    vi.stubGlobal("Image", function FakeImage() { return image; });
    vi.stubGlobal("document", {
      createElement: (tagName: string) => tagName === "canvas" ? canvas : image,
    });

    await renderLongImageSegment({
      index: 1,
      width: 1000,
      height: 700,
      startLine: 1,
      endLine: 1,
      startLabel: "开头",
      endLabel: "结尾",
      firstSentence: "正文。",
      splitInsideParagraph: false,
      lines: [{
        lineNumber: 1,
        blockIndex: 0,
        kind: "paragraph",
        text: "正文。",
        x: 100,
        y: 120,
        font: "36px serif",
        align: "left",
      }],
    }, {
      ...options(),
      width: 1000,
      paperTheme: "custom",
      customPaperImage: "app://paper.png",
    } as never);

    expect(operations).toContainEqual({ kind: "load-image", value: "app://paper.png" });
    expect(operations.some(({ kind }) => kind === "draw-image")).toBe(true);
    expect(fillStyles).toEqual(["#f8f5ee", "rgba(248, 245, 238, 0.78)", "#342f28"]);
    expect(operations).toContainEqual({ kind: "fill-rect", value: [0, 0, 1000, 700] });
  });

  it("falls back to the flat custom paper color when the selected image is missing", async () => {
    const operations: string[] = [];
    const fillStyles: string[] = [];
    let currentFillStyle = "";
    const image = {
      naturalWidth: 0,
      naturalHeight: 0,
      onload: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      set src(_value: string) {
        operations.push("load-image");
        throw new Error("paper image missing");
      },
    };
    const context = {
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(value: string) {
        currentFillStyle = value;
        fillStyles.push(value);
      },
      textBaseline: "",
      textAlign: "",
      font: "",
      fillRect: () => undefined,
      drawImage: () => operations.push("draw-image"),
      fillText: () => undefined,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
    };
    vi.stubGlobal("Image", function FakeImage() { return image; });
    vi.stubGlobal("document", { createElement: () => canvas });

    await expect(renderLongImageSegment({
      index: 1,
      width: 1000,
      height: 700,
      startLine: 1,
      endLine: 1,
      startLabel: "开头",
      endLabel: "结尾",
      firstSentence: "正文。",
      splitInsideParagraph: false,
      lines: [],
    }, {
      ...options(),
      width: 1000,
      paperTheme: "custom",
      customPaperImage: "app://missing-paper.png",
    } as never)).resolves.toBeInstanceOf(ArrayBuffer);

    expect(operations).toEqual(["load-image"]);
    expect(fillStyles).toEqual(["#f8f5ee", "#342f28"]);
  });
});
