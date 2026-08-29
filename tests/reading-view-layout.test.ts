import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("reading view writing layout", () => {
  it("uses the selected heading font variable for both editor and reading headings", () => {
    const styles = readFileSync(resolve("styles.css"), "utf8");

    const headingVariableScopes = [
      ".workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian)",
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-heading-font-family",
    ];
    for (const scope of headingVariableScopes) {
      const blockStart = styles.indexOf(`${scope} {`);
      const blockEnd = styles.indexOf("}", blockStart);
      expect(blockStart).toBeGreaterThanOrEqual(0);
      const block = styles.slice(blockStart, blockEnd);
      for (let level = 1; level <= 6; level += 1) {
        expect(block).toContain(`--h${level}-font: var(--cw-heading-font-family);`);
      }
    }
  });

  it("targets only direct normal prose paths in every reading-view layout mode", () => {
    const styles = readFileSync(resolve("styles.css"), "utf8");

    const normalProsePaths = [
      ".markdown-preview-view > .markdown-preview-sizer > p",
      ".markdown-preview-view > .markdown-preview-sizer > .el-p > p",
      ".markdown-preview-view > .markdown-preview-sizer > .markdown-preview-section > p",
      ".markdown-preview-view > .markdown-preview-sizer > .markdown-preview-section > .el-p > p",
    ];
    const layoutScopes = [
      ".workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian)",
      ".workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian).cw-ragged-text",
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-paragraph-spacing",
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-first-line-indent",
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-justify-text:not(.cw-ragged-text)",
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-justify-text.cw-ragged-text",
    ];

    for (const scope of layoutScopes) {
      for (const path of normalProsePaths) {
        expect(styles).toContain(`${scope} ${path}`);
      }
    }

    expect(styles).not.toContain(".markdown-preview-sizer .markdown-preview-section");
  });

  it("groups br-separated rendered nodes into independent prose lines", async () => {
    const modulePath = "../src/reading-view-lines.ts";
    const readingViewLines = await import(/* @vite-ignore */ modulePath).catch(
      () => null,
    );

    expect(readingViewLines).not.toBeNull();
    if (!readingViewLines) return;

    const firstText = { kind: "text", value: "第一段" };
    const firstBreak = { kind: "break" };
    const secondText = { kind: "text", value: "第二段" };
    const secondBreak = { kind: "break" };
    const thirdText = { kind: "text", value: "第三段" };

    expect(
      readingViewLines.groupReadingProseNodes(
        [firstText, firstBreak, secondText, secondBreak, thirdText],
        (node: { kind: string }) => node.kind === "break",
      ),
    ).toEqual([
      { nodes: [firstText], breakAfter: firstBreak },
      { nodes: [secondText], breakAfter: secondBreak },
      { nodes: [thirdText] },
    ]);
  });

  it("runs the prose-line synchronizer for rendered and already-open views", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    const styles = readFileSync(resolve("styles.css"), "utf8");

    expect(main).toContain("this.registerMarkdownPostProcessor");
    expect(main).toMatch(/syncReadingProseLines\(\s*element,/);
    expect(main).toMatch(/syncReadingProseLines\(\s*container,\s*enabled\s*\)/);
    expect(styles).toContain(".cw-reading-prose-lines");
    expect(styles).toContain(".cw-reading-prose-line");
    expect(styles).toContain(".cw-reading-prose-break");
  });
});

// ---------------------------------------------------------------------------
// Minimal DOM shim (no jsdom dependency) so the prose-line wrapper can be
// exercised for real: wrap / idempotency / restore / inline preservation /
// structural-block exclusion.
// ---------------------------------------------------------------------------

type ShimNode = ShimElement | ShimTextNode;
type ShimContainer = ShimElement | ShimFragment;

class ShimClassList {
  private readonly names = new Set<string>();
  add(...items: string[]): void {
    for (const item of items) this.names.add(item);
  }
  remove(...items: string[]): void {
    for (const item of items) this.names.delete(item);
  }
  contains(item: string): boolean {
    return this.names.has(item);
  }
}

class ShimTextNode {
  nodeType = 3;
  tagName = "";
  container: ShimContainer | null = null;
  constructor(readonly textContent: string) {}
}

class ShimFragment {
  childNodes: ShimNode[] = [];
  append(...nodes: ShimNode[]): void {
    for (const node of nodes) this.adopt(node);
  }
  private adopt(node: ShimNode): void {
    detachShim(node);
    node.container = this;
    this.childNodes.push(node);
  }
}

function detachShim(node: ShimNode): void {
  const container = node.container;
  if (!container) return;
  const index = container.childNodes.indexOf(node);
  if (index >= 0) container.childNodes.splice(index, 1);
}

class HTMLElementBase {}

class NodeBase {
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
}

class ShimElement extends HTMLElementBase {
  nodeType = 1;
  container: ShimContainer | null = null;
  childNodes: ShimNode[] = [];
  readonly classList = new ShimClassList();
  readonly ownerDocument: ShimDocument;

  constructor(readonly tagName: string, ownerDocument: ShimDocument) {
    super();
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): ShimNode | null {
    return this.childNodes[0] ?? null;
  }

  append(...nodes: ShimNode[]): void {
    for (const node of nodes) this.adopt(node);
  }

  private adopt(node: ShimNode): void {
    detachShim(node);
    node.container = this;
    this.childNodes.push(node);
  }

  replaceChildren(...nodes: (ShimNode | ShimFragment)[]): void {
    for (const child of this.childNodes) child.container = null;
    this.childNodes = [];
    for (const node of nodes) {
      if (node instanceof ShimFragment) {
        for (const child of [...node.childNodes]) this.adopt(child);
      } else {
        this.adopt(node);
      }
    }
  }

  querySelectorAll(selector: string): ShimElement[] {
    const result: ShimElement[] = [];
    const walk = (element: ShimElement): void => {
      for (const child of element.childNodes) {
        if (child instanceof ShimElement) {
          if (matchesShimSelector(child, selector)) result.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return result;
  }

  closest(selector: string): ShimElement | null {
    let current: ShimElement | null = this;
    while (current) {
      if (matchesShimSelector(current, selector)) return current;
      const container: ShimContainer | null = current.container;
      current = container instanceof ShimElement ? container : null;
    }
    return null;
  }
}

class ShimDocument {
  createElement(tagName: string): ShimElement {
    return new ShimElement(tagName.toUpperCase(), this);
  }
  createDocumentFragment(): ShimFragment {
    return new ShimFragment();
  }
}

function matchesShimSelector(element: ShimElement, selector: string): boolean {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .some((part) =>
      part.startsWith(".")
        ? element.classList.contains(part.slice(1))
        : element.tagName === part.toUpperCase(),
    );
}

function shimText(parent: ShimElement, text: string): ShimTextNode {
  const node = new ShimTextNode(text);
  parent.append(node);
  return node;
}

function shimBr(parent: ShimElement): ShimElement {
  return parent.ownerDocument.createElement("br");
}

function shimTextContent(node: ShimNode): string {
  if (node instanceof ShimTextNode) return node.textContent;
  if (node instanceof ShimElement) {
    return node.childNodes.map((child) => shimTextContent(child)).join("");
  }
  return "";
}

describe("reading view prose-line DOM wrapper", () => {
  beforeAll(() => {
    (globalThis as unknown as { Node: typeof NodeBase }).Node = NodeBase;
    (globalThis as unknown as { HTMLElement: typeof HTMLElementBase }).HTMLElement =
      HTMLElementBase;
  });

  it("exposes a structural-block exclusion selector", () => {
    const source = readFileSync(resolve("src/reading-view-lines.ts"), "utf8");
    const selectorStart = source.indexOf("EXCLUDED_CONTAINER_SELECTOR");
    expect(selectorStart).toBeGreaterThan(-1);
    const selectorBlock = source.slice(selectorStart);
    for (const token of [
      "blockquote",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "table",
      ".callout",
      ".markdown-embed",
      ".internal-embed",
      ".metadata-container",
      ".frontmatter",
    ]) {
      expect(selectorBlock).toContain(token);
    }
    // Must be decided by ancestor exclusion, not by `.markdown-preview-sizer`.
    expect(selectorBlock).toContain("closest(EXCLUDED_CONTAINER_SELECTOR)");
    expect(source).not.toContain('closest(".markdown-preview-sizer")');
  });

  it("wraps br-separated lines, preserves inline DOM, is idempotent and restores", async () => {
    const modulePath = "../src/reading-view-lines.ts";
    const readingViewLines = await import(
      /* @vite-ignore */ modulePath
    ).catch(() => null);
    expect(readingViewLines).not.toBeNull();
    if (!readingViewLines) return;
    const { syncReadingProseLines } = readingViewLines;

    const doc = new ShimDocument();
    const root = doc.createElement("div");

    const paragraph = doc.createElement("p");
    shimText(paragraph, "第一段");
    const br1 = shimBr(paragraph);
    paragraph.append(br1);
    const strong = doc.createElement("strong");
    shimText(strong, "第二段");
    paragraph.append(strong);
    const br2 = shimBr(paragraph);
    paragraph.append(br2);
    shimText(paragraph, "第三段");
    root.append(paragraph);

    syncReadingProseLines(root, true);

    expect(paragraph.classList.contains("cw-reading-prose-lines")).toBe(true);
    const lines = paragraph.childNodes.filter(
      (node): node is ShimElement => node instanceof ShimElement,
    );
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.tagName).toBe("SPAN");
      expect(line.classList.contains("cw-reading-prose-line")).toBe(true);
    }
    expect(shimTextContent(lines[0])).toBe("第一段");
    expect(shimTextContent(lines[1])).toBe("第二段");
    expect(shimTextContent(lines[2])).toBe("第三段");

    // Inline `<strong>` must survive as a real element, not flattened text.
    const preservedStrong = lines[1].childNodes.find(
      (node): node is ShimElement =>
        node instanceof ShimElement && node.tagName === "STRONG",
    );
    expect(preservedStrong).toBeDefined();

    // Idempotency: a second sync must not nest another span layer.
    syncReadingProseLines(root, true);
    const linesAfterSecondPass = paragraph.childNodes.filter(
      (node): node is ShimElement => node instanceof ShimElement,
    );
    expect(linesAfterSecondPass).toHaveLength(3);
    for (const line of linesAfterSecondPass) {
      expect(line.tagName).toBe("SPAN");
      expect(
        line.childNodes.some(
          (node) => node instanceof ShimElement && node.tagName === "SPAN",
        ),
      ).toBe(false);
    }

    // Restore: flatten back to the original text + br + text + br + text shape.
    syncReadingProseLines(root, false);
    expect(paragraph.classList.contains("cw-reading-prose-lines")).toBe(false);
    const restoredText = paragraph.childNodes
      .map((node) => shimTextContent(node))
      .join("");
    expect(restoredText).toBe("第一段第二段第三段");
    expect(paragraph.childNodes.some((node) => node instanceof ShimElement && node.tagName === "STRONG")).toBe(true);
  });

  it("does not wrap paragraphs nested in structural blocks", async () => {
    const modulePath = "../src/reading-view-lines.ts";
    const readingViewLines = await import(
      /* @vite-ignore */ modulePath
    ).catch(() => null);
    if (!readingViewLines) return;
    const { syncReadingProseLines } = readingViewLines;

    const doc = new ShimDocument();
    const root = doc.createElement("div");

    const quote = doc.createElement("blockquote");
    const quoteParagraph = doc.createElement("p");
    shimText(quoteParagraph, "引用第一行");
    const quoteBr = shimBr(quoteParagraph);
    quoteParagraph.append(quoteBr);
    shimText(quoteParagraph, "引用第二行");
    quote.append(quoteParagraph);
    root.append(quote);

    const list = doc.createElement("ul");
    const item = doc.createElement("li");
    const itemParagraph = doc.createElement("p");
    shimText(itemParagraph, "列表第一行");
    const itemBr = shimBr(itemParagraph);
    itemParagraph.append(itemBr);
    shimText(itemParagraph, "列表第二行");
    item.append(itemParagraph);
    list.append(item);
    root.append(list);

    syncReadingProseLines(root, true);

    expect(quoteParagraph.classList.contains("cw-reading-prose-lines")).toBe(false);
    expect(itemParagraph.classList.contains("cw-reading-prose-lines")).toBe(false);
  });
});
