import type { UserFont } from "./types";

export const SUPPORTED_USER_FONT_FORMATS = ["ttf", "otf", "woff", "woff2"] as const;

export interface UserFontStorageAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
}

export interface UserFontMigrationResult {
  migratedFiles: number;
  legacyDirectoryRemoved: boolean;
  failures: string[];
}

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
  configDir: string,
  pluginId: string,
): string {
  return normalizePath(`${configDir}/${pluginId}/fonts`);
}

export function getLegacyUserFontDirectory(
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

function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

async function ensureDirectory(
  adapter: Pick<UserFontStorageAdapter, "exists" | "mkdir">,
  directory: string,
): Promise<void> {
  const segments = normalizePath(directory).split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
}

function binaryEquals(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

export async function findUserFontFilePath(
  adapter: Pick<UserFontStorageAdapter, "exists">,
  currentDirectory: string,
  legacyDirectory: string,
  fileName: string,
): Promise<string | undefined> {
  const currentPath = getUserFontFilePath(currentDirectory, fileName);
  if (await adapter.exists(currentPath)) return currentPath;
  const legacyPath = getUserFontFilePath(legacyDirectory, fileName);
  return await adapter.exists(legacyPath) ? legacyPath : undefined;
}

export async function migrateLegacyUserFontDirectory(
  adapter: UserFontStorageAdapter,
  legacyDirectory: string,
  currentDirectory: string,
): Promise<UserFontMigrationResult> {
  const legacy = normalizePath(legacyDirectory);
  const current = normalizePath(currentDirectory);
  const result: UserFontMigrationResult = {
    migratedFiles: 0,
    legacyDirectoryRemoved: false,
    failures: [],
  };
  if (legacy === current || !(await adapter.exists(legacy))) return result;

  const initialListing = await adapter.list(legacy);
  if (!(await adapter.exists(current))) {
    try {
      await ensureDirectory(adapter, getParentPath(current));
      await adapter.rename(legacy, current);
      result.migratedFiles = initialListing.files.length;
      result.legacyDirectoryRemoved = true;
      return result;
    } catch {
      // Some mobile adapters cannot rename a directory. Copy verified files instead.
    }
  }

  await ensureDirectory(adapter, current);
  for (const sourcePath of initialListing.files) {
    const fileName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
    const targetPath = getUserFontFilePath(current, fileName);
    let createdTarget = false;
    try {
      const sourceData = await adapter.readBinary(sourcePath);
      if (await adapter.exists(targetPath)) {
        const targetData = await adapter.readBinary(targetPath);
        if (!binaryEquals(sourceData, targetData)) {
          result.failures.push(sourcePath);
          continue;
        }
      } else {
        await adapter.writeBinary(targetPath, sourceData);
        createdTarget = true;
        const writtenData = await adapter.readBinary(targetPath);
        if (!binaryEquals(sourceData, writtenData)) throw new Error("Font copy verification failed");
      }
      await adapter.remove(sourcePath);
      result.migratedFiles += 1;
    } catch {
      if (createdTarget) {
        try {
          await adapter.remove(targetPath);
        } catch {
          // Keep the verified legacy file as the authoritative recovery source.
        }
      }
      result.failures.push(sourcePath);
    }
  }

  const remaining = await adapter.list(legacy);
  if (remaining.files.length === 0 && remaining.folders.length === 0) {
    try {
      await adapter.rmdir(legacy, false);
      result.legacyDirectoryRemoved = true;
    } catch {
      result.failures.push(legacy);
    }
  } else {
    result.failures.push(...remaining.folders);
  }
  return result;
}
