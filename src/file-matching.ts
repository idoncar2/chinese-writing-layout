/**
 * Match a vault-relative file path against a vault-relative folder path.
 * The vault root contains every file; otherwise only direct children are
 * included unless descendants are explicitly requested.
 */
export function isFileInFolder(
  filePath: string,
  folderPath: string,
  includeSubfolders: boolean,
): boolean {
  const normalizedFolder = normalizeVaultPath(folderPath);
  if (!normalizedFolder) return true;

  const normalizedFile = normalizeVaultPath(filePath);
  const prefix = `${normalizedFolder}/`;
  if (!normalizedFile.startsWith(prefix)) return false;

  const relativePath = normalizedFile.slice(prefix.length);
  return includeSubfolders || !relativePath.includes("/");
}

/**
 * Match a basename against a case-insensitive glob where `*` is the only
 * special character. The matcher operates on Unicode code points and never
 * evaluates the pattern as user-provided regular expression syntax.
 */
export function matchBasenameGlob(basename: string, pattern: string): boolean {
  if (!pattern.trim()) return false;

  const text = Array.from(basename.toLowerCase());
  const tokens = Array.from(pattern.toLowerCase());
  let textIndex = 0;
  let tokenIndex = 0;
  let lastStarIndex = -1;
  let starMatchIndex = 0;

  while (textIndex < text.length) {
    const token = tokens[tokenIndex];
    if (token !== undefined && token !== "*" && token === text[textIndex]) {
      tokenIndex++;
      textIndex++;
      continue;
    }

    if (token === "*") {
      lastStarIndex = tokenIndex;
      starMatchIndex = textIndex;
      tokenIndex++;
      continue;
    }

    if (lastStarIndex < 0) return false;
    tokenIndex = lastStarIndex + 1;
    starMatchIndex++;
    textIndex = starMatchIndex;
  }

  while (tokens[tokenIndex] === "*") tokenIndex++;
  return tokenIndex === tokens.length;
}

/**
 * Return a copy of a path-keyed record with one exact key or folder subtree
 * moved to a new path. Values are retained as-is and the input is untouched.
 */
export function remapPathKeys<T>(
  values: Record<string, T>,
  oldPath: string,
  newPath: string,
): Record<string, T> {
  const remapped: Record<string, T> = {};

  for (const [key, value] of Object.entries(values)) {
    remapped[remapVaultPath(key, oldPath, newPath)] = value;
  }

  return remapped;
}

/** Remap one exact vault path or descendant path while preserving non-matches. */
export function remapVaultPath(path: string, oldPath: string, newPath: string): string {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedOldPath = normalizeVaultPath(oldPath);
  if (!isExactOrDescendantPath(normalizedPath, normalizedOldPath)) return path;

  const relativePath = normalizedOldPath
    ? normalizedPath.slice(normalizedOldPath.length + 1)
    : normalizedPath;
  return makePath(normalizeVaultPath(newPath), relativePath);
}

/**
 * Return a copy of a path-keyed record without one exact key or folder
 * subtree. Similar path prefixes remain untouched.
 */
export function deletePathKeys<T>(
  values: Record<string, T>,
  path: string,
): Record<string, T> {
  const normalizedPath = normalizeVaultPath(path);
  const remaining: Record<string, T> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!isExactOrDescendantPath(key, normalizedPath)) {
      remaining[key] = value;
    }
  }

  return remaining;
}

function normalizeVaultPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function isExactOrDescendantPath(path: string, basePath: string): boolean {
  return basePath === "" || path === basePath || path.startsWith(`${basePath}/`);
}

function makePath(basePath: string, relativePath: string): string {
  if (!basePath) return relativePath;
  return relativePath ? `${basePath}/${relativePath}` : basePath;
}
