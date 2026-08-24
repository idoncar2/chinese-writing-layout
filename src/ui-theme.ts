import type { InterfaceAccentMode } from "./types";

export const DEFAULT_INTERFACE_ACCENT = "#bd765f";

export function normalizeInterfaceAccentMode(value: unknown): InterfaceAccentMode {
  return value === "custom" ? "custom" : "theme";
}

export function normalizeAccentColor(
  value: unknown,
  fallback = DEFAULT_INTERFACE_ACCENT,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((digit) => digit.repeat(2)).join("")}`;
  }
  return fallback;
}

function toLinearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function getAccentContrastColor(color: string): "#111827" | "#ffffff" {
  const normalized = normalizeAccentColor(color);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = 0.2126 * toLinearChannel(red)
    + 0.7152 * toLinearChannel(green)
    + 0.0722 * toLinearChannel(blue);
  const darkContrast = (luminance + 0.05) / 0.05;
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? "#111827" : "#ffffff";
}
