import type { UserFont } from "./types";

export const SUPPORTED_USER_FONT_FORMATS = ["ttf", "otf", "woff", "woff2"] as const;

function normalizePath(value: string): string {
  return value
    .replace(/\\/gu, "/")
    .replace(/\/+/gu, "/")
    .replace(/\/$/u, "");
}

function getSafeBaseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/u, "").trim();
}

export function getUserFontFormat(fileName: string): UserFont["format"] | undefined {
  const extension = getSafeBaseName(fileName).split(".").pop()?.toLowerCase();
  return SUPPORTED_USER_FONT_FORMATS.includes(extension as UserFont["format"])
    ? extension as UserFont["format"]
    : undefined;
}

export function createUserFontMetadata(
  originalFileName: string,
  id: string,
): UserFont | undefined {
  const safeOriginalFileName = getSafeBaseName(originalFileName);
  const format = getUserFontFormat(safeOriginalFileName);
  const normalizedId = id.trim();
  if (!safeOriginalFileName || !format || !normalizedId) return undefined;
  const suffix = `.${format}`;
  const name = safeOriginalFileName.slice(0, -suffix.length).trim() || safeOriginalFileName;
  return {
    id: normalizedId,
    name,
    fileName: `${normalizedId}.${format}`,
    originalFileName: safeOriginalFileName,
    format,
  };
}

export function createUserFontId(
  existingIds: Iterable<string>,
  token: string,
): string {
  const existing = new Set(existingIds);
  const safeToken = token
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "font";
  const base = `cw-user-${safeToken}`;
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function getUserFontDirectory(
  pluginDirectory: string | undefined,
  configDir: string,
  pluginId: string,
): string {
  const baseDirectory = pluginDirectory?.trim()
    || `${configDir}/plugins/${pluginId}`;
  return normalizePath(`${baseDirectory}/fonts`);
}

export function getUserFontFilePath(directory: string, fileName: string): string {
  return normalizePath(`${directory}/${fileName}`);
}
