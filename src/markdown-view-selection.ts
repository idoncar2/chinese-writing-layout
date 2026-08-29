import type { MarkdownView } from "obsidian";

export function selectMarkdownView(
  active: MarkdownView | null | undefined,
  remembered: MarkdownView | null | undefined,
  loaded: readonly MarkdownView[],
): MarkdownView | null {
  const candidates = [active, remembered, ...loaded];
  return candidates.find((view) => Boolean(view?.file)) ?? null;
}
