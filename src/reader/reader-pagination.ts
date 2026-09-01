export function clampReaderPage(page: number, totalPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 1;
  const safePage = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.floor(totalPages), Math.max(1, safePage));
}

export function calculateReaderPageCount(
  scrollWidth: number,
  pageWidth: number,
  pageGap: number,
): number {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return 1;
  const width = Math.max(0, Number.isFinite(scrollWidth) ? scrollWidth : 0);
  const gap = Math.max(0, Number.isFinite(pageGap) ? pageGap : 0);
  return Math.max(1, Math.ceil((width + gap) / (pageWidth + gap)));
}

export function calculateReaderPageOffset(
  page: number,
  pageWidth: number,
  pageGap: number,
): number {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const safeWidth = Math.max(0, Number.isFinite(pageWidth) ? pageWidth : 0);
  const safeGap = Math.max(0, Number.isFinite(pageGap) ? pageGap : 0);
  return (safePage - 1) * (safeWidth + safeGap);
}

export function readerPageFromProgress(progress: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  const safeProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return clampReaderPage(Math.round(safeProgress * (safeTotal - 1)) + 1, safeTotal);
}

export function readerProgressFromPage(page: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  if (safeTotal === 1) return 0;
  return (clampReaderPage(page, safeTotal) - 1) / (safeTotal - 1);
}
