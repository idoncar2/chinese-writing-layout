export function phonePreviewScale(width: number, height: number, availableWidth: number, availableHeight: number): number {
  return Math.max(0, Math.min(1, availableWidth / width, availableHeight / height));
}

export function scrollProgress(top: number, height: number, viewport: number): number {
  return height > viewport ? Math.min(1, Math.max(0, top / (height - viewport))) : 0;
}

export function scrollTarget(progress: number, height: number, viewport: number): number {
  return Math.min(1, Math.max(0, progress)) * Math.max(0, height - viewport);
}
