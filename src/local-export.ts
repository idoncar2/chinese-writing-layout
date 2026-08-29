export interface LocalImageExportTarget {
  directory: string;
  baseName: string;
}

function getExtension(extension: string): string {
  return extension.replace(/^\.+/, "").toLowerCase() || "txt";
}

function getLastSeparatorIndex(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

function getPathSeparator(path: string): "/" | "\\" {
  return path.lastIndexOf("\\") > path.lastIndexOf("/") ? "\\" : "/";
}

function stripExtension(fileName: string, extension?: string): string {
  if (extension) {
    const suffix = `.${getExtension(extension)}`;
    if (fileName.toLowerCase().endsWith(suffix)) {
      return fileName.slice(0, -suffix.length);
    }
  }
  return fileName.replace(/\.[^./\\]+$/, "");
}

export function getLocalExportDirectory(filePath: string): string {
  const separatorIndex = getLastSeparatorIndex(filePath);
  if (separatorIndex < 0) return "";
  if (separatorIndex === 0) return filePath.slice(0, 1);
  if (separatorIndex === 2 && filePath[1] === ":") return filePath.slice(0, 3);
  return filePath.slice(0, separatorIndex);
}

export function getLocalExportFileName(filePath: string): string {
  const separatorIndex = getLastSeparatorIndex(filePath);
  return separatorIndex < 0 ? filePath : filePath.slice(separatorIndex + 1);
}

export function joinLocalExportPath(directory: string, fileName: string): string {
  if (!directory) return fileName;
  if (directory.endsWith("/") || directory.endsWith("\\")) {
    return `${directory}${fileName}`;
  }
  return `${directory}${getPathSeparator(directory)}${fileName}`;
}

export function normalizeLocalExportPath(selectedPath: string, extension: string): string {
  const safeExtension = getExtension(extension);
  const directory = getLocalExportDirectory(selectedPath);
  const selectedName = getLocalExportFileName(selectedPath);
  const baseName = stripExtension(selectedName, safeExtension);
  return joinLocalExportPath(directory, `${baseName}.${safeExtension}`);
}

export function getLocalExportBaseName(selectedPath: string, extension: string): string {
  return stripExtension(getLocalExportFileName(normalizeLocalExportPath(selectedPath, extension)), extension);
}

export function getAvailableLocalExportPath(
  selectedPath: string,
  extension: string,
  pathExists: (path: string) => boolean,
): string {
  const safeExtension = getExtension(extension);
  const normalizedPath = normalizeLocalExportPath(selectedPath, safeExtension);
  if (!pathExists(normalizedPath)) return normalizedPath;

  const directory = getLocalExportDirectory(normalizedPath);
  const baseName = getLocalExportBaseName(normalizedPath, safeExtension);
  let suffix = 1;
  let candidate = joinLocalExportPath(directory, `${baseName} (${suffix}).${safeExtension}`);
  while (pathExists(candidate)) {
    suffix += 1;
    candidate = joinLocalExportPath(directory, `${baseName} (${suffix}).${safeExtension}`);
  }
  return candidate;
}

export function getAvailableLocalImageExportTarget(
  selectedPath: string,
  pathExists: (path: string) => boolean,
): LocalImageExportTarget {
  const extension = "png";
  const normalizedPath = normalizeLocalExportPath(selectedPath, extension);
  const directory = getLocalExportDirectory(normalizedPath);
  const baseName = getLocalExportBaseName(normalizedPath, extension);

  const isOccupied = (candidateBaseName: string): boolean => pathExists(
    joinLocalExportPath(directory, `${candidateBaseName}.${extension}`),
  ) || pathExists(
    joinLocalExportPath(directory, `${candidateBaseName}-第1张.${extension}`),
  ) || pathExists(
    joinLocalExportPath(directory, `${candidateBaseName}-第1页.${extension}`),
  );

  if (!isOccupied(baseName)) return { directory, baseName };

  let suffix = 1;
  let candidateBaseName = `${baseName} (${suffix})`;
  while (isOccupied(candidateBaseName)) {
    suffix += 1;
    candidateBaseName = `${baseName} (${suffix})`;
  }
  return { directory, baseName: candidateBaseName };
}
