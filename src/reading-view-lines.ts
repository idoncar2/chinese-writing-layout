export interface ReadingProseNodeGroup<T> {
  nodes: T[];
  breakAfter?: T;
}

export function groupReadingProseNodes<T>(
  nodes: readonly T[],
  isBreak: (node: T) => boolean,
): ReadingProseNodeGroup<T>[] {
  const groups: ReadingProseNodeGroup<T>[] = [];
  let current: T[] = [];

  for (const node of nodes) {
    if (isBreak(node)) {
      groups.push({ nodes: current, breakAfter: node });
      current = [];
    } else {
      current.push(node);
    }
  }

  groups.push({ nodes: current });
  return groups;
}

const PROSE_LINES_CLASS = "cw-reading-prose-lines";
const PROSE_LINE_CLASS = "cw-reading-prose-line";
const PROSE_BREAK_CLASS = "cw-reading-prose-break";

function isBreakNode(node: Node): node is HTMLBRElement {
  return node.nodeType === Node.ELEMENT_NODE
    && (node as Element).tagName === "BR";
}

/**
 * Structural and special blocks whose inner `<p>` must stay native. A main
 * prose paragraph is any `<p>` that is not nested inside one of these.
 *
 * `Element.closest` walks the ancestor chain even while the post-processor
 * element is still detached from the live DOM, so this check keeps working
 * during the first render pass — before Obsidian attaches the section to
 * `.markdown-preview-sizer`.
 */
export const EXCLUDED_CONTAINER_SELECTOR = [
  // 引用 / 列表
  "blockquote",
  "ul",
  "ol",
  "li",
  // 代码块
  "pre",
  "code",
  // 表格
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  // 嵌入 / callout
  ".callout",
  ".markdown-embed",
  ".internal-embed",
  // 脚注 / 公式
  ".footnotes",
  ".math-block",
  // YAML / frontmatter
  ".metadata-container",
  ".frontmatter",
  ".frontmatter-container",
].join(", ");

function isMainPreviewParagraph(paragraph: HTMLParagraphElement): boolean {
  return paragraph.closest(EXCLUDED_CONTAINER_SELECTOR) === null;
}

function collectParagraphs(root: HTMLElement): HTMLParagraphElement[] {
  const paragraphs = Array.from(
    root.querySelectorAll<HTMLParagraphElement>("p"),
  );
  if (root.tagName === "P") paragraphs.unshift(root as HTMLParagraphElement);
  return paragraphs;
}

function wrapParagraphLines(paragraph: HTMLParagraphElement): void {
  if (paragraph.classList.contains(PROSE_LINES_CLASS)) return;
  const groups = groupReadingProseNodes(
    Array.from(paragraph.childNodes),
    isBreakNode,
  ).filter((group) => group.nodes.length > 0 || group.breakAfter !== undefined);
  if (groups.length < 2) return;

  const lines = groups.map((group) => {
    const line = paragraph.ownerDocument.createElement("span");
    line.classList.add(PROSE_LINE_CLASS);
    line.append(...group.nodes);
    if (group.breakAfter && isBreakNode(group.breakAfter)) {
      group.breakAfter.classList.add(PROSE_BREAK_CLASS);
      line.append(group.breakAfter);
    }
    return line;
  });

  paragraph.replaceChildren(...lines);
  paragraph.classList.add(PROSE_LINES_CLASS);
}

function restoreParagraphLines(paragraph: HTMLParagraphElement): void {
  if (!paragraph.classList.contains(PROSE_LINES_CLASS)) return;
  const fragment = paragraph.ownerDocument.createDocumentFragment();

  for (const child of Array.from(paragraph.childNodes)) {
    if (
      child instanceof HTMLElement
      && child.classList.contains(PROSE_LINE_CLASS)
    ) {
      while (child.firstChild) {
        const node = child.firstChild;
        if (isBreakNode(node)) node.classList.remove(PROSE_BREAK_CLASS);
        fragment.append(node);
      }
    } else {
      fragment.append(child);
    }
  }

  paragraph.replaceChildren(fragment);
  paragraph.classList.remove(PROSE_LINES_CLASS);
}

export function syncReadingProseLines(
  root: HTMLElement,
  enabled: boolean,
): void {
  const paragraphs = collectParagraphs(root);
  if (!enabled) {
    for (const paragraph of paragraphs) restoreParagraphLines(paragraph);
    return;
  }

  for (const paragraph of paragraphs) {
    if (isMainPreviewParagraph(paragraph)) wrapParagraphLines(paragraph);
  }
}
