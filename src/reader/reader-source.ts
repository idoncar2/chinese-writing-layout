export interface ReaderSourceView {
  file?: { path: string } | null;
  editor?: { getValue: () => string };
}

export async function resolveReaderSource(
  filePath: string,
  sourceView: ReaderSourceView | null | undefined,
  readCached: () => Promise<string>,
): Promise<string> {
  if (sourceView?.file?.path === filePath && sourceView.editor) {
    return sourceView.editor.getValue();
  }
  return readCached();
}
