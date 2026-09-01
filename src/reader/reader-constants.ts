import { normalizeFontSelection } from "../font-selection";
import {
  DEFAULT_SETTINGS,
  type ReaderBackground,
  type ReaderMode,
  type ReaderSettings,
} from "../types";

/** Experimental reader implementation is kept staged but hidden for now. */
export const READER_MODE_ENABLED = false;
export const READER_VIEW_TYPE = "chinese-writing-reader";
export const READER_PHONE_BASE_WIDTH = 390;
export const READER_PHONE_BASE_HEIGHT = 780;
export const READER_PHONE_PAGE_GAP = 24;

export const READER_BACKGROUND_OPTIONS: readonly {
  value: ReaderBackground;
  label: string;
}[] = [
  { value: "white", label: "纸白" },
  { value: "warm", label: "暖白" },
  { value: "gray", label: "雾灰" },
  { value: "dark", label: "深色" },
];

export function normalizeReaderMode(value: unknown): ReaderMode {
  return value === "phone" ? "phone" : "desktop";
}

export function normalizeReaderBackground(value: unknown): ReaderBackground {
  return READER_BACKGROUND_OPTIONS.some((option) => option.value === value)
    ? value as ReaderBackground
    : DEFAULT_SETTINGS.readerSettings.background;
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
  const clamped = Math.min(maximum, Math.max(minimum, numeric));
  if (step <= 0) return clamped;
  return Number((Math.round((clamped - minimum) / step) * step + minimum).toFixed(4));
}

export function normalizeReaderSettings(value: unknown): ReaderSettings {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const defaults = DEFAULT_SETTINGS.readerSettings;
  return {
    font: normalizeFontSelection(
      candidate.font,
      "body",
      { source: "obsidian", id: "text" },
    ),
    fontSize: normalizeNumber(candidate.fontSize, defaults.fontSize, 14, 30, 1),
    lineHeight: normalizeNumber(candidate.lineHeight, defaults.lineHeight, 1.4, 2.6, 0.1),
    paragraphSpacing: normalizeNumber(
      candidate.paragraphSpacing,
      defaults.paragraphSpacing,
      0,
      2,
      0.1,
    ),
    contentWidth: normalizeNumber(
      candidate.contentWidth,
      defaults.contentWidth,
      520,
      960,
      1,
    ),
    pagePadding: normalizeNumber(
      candidate.pagePadding,
      defaults.pagePadding,
      16,
      80,
      1,
    ),
    background: normalizeReaderBackground(candidate.background),
  };
}

export function normalizeReaderViewState(value: unknown): {
  file: string;
  mode: ReaderMode;
} {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    file: typeof candidate.file === "string" ? candidate.file : "",
    mode: normalizeReaderMode(candidate.mode),
  };
}
