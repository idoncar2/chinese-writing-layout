import { App, Component, MarkdownRenderer } from "obsidian";
import { syncReadingProseLines } from "../reading-view-lines";

export async function renderReaderMarkdown(
  app: App,
  markdown: string,
  target: HTMLElement,
  sourcePath: string,
  component: Component,
): Promise<void> {
  await MarkdownRenderer.render(app, markdown, target, sourcePath, component);
  // A writing-mode postprocessor may have wrapped prose lines in the source
  // preview. Reader mode always owns a clean, native Markdown DOM.
  syncReadingProseLines(target, false);
}

export async function waitForReaderAssets(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  if (images.length === 0) return;
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    if (image.complete) {
      resolve();
      return;
    }
    const finish = (): void => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, 2500);
  })));
}
