export interface RenderedContentWidth {
  pixels: number;
  characterHint: number;
}

export function describeRenderedContentWidth(
  renderedWidthPx: number,
  fontSizePx: number,
): RenderedContentWidth | null {
  if (
    !Number.isFinite(renderedWidthPx)
    || renderedWidthPx <= 0
    || !Number.isFinite(fontSizePx)
    || fontSizePx <= 0
  ) return null;

  return {
    pixels: renderedWidthPx,
    characterHint: Math.round(renderedWidthPx / fontSizePx),
  };
}
