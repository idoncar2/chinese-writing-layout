import { readFileSync } from "node:fs";
import { transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the actual image-row setup with a minimal DOM boundary.
const source = readFileSync("src/writing-panel.ts", "utf8");
const start = source.indexOf("    const imageRow =");
const end = source.indexOf("    const colorRow =", start);
const setupRow = new Function("section", "themeSelect", "layout",
  transpileModule(source.slice(start, end), { compilerOptions: { target: 9 } }).outputText);

class ElementStub {
  children: ElementStub[] = [];
  events = new Map<string, () => void>();
  value = "";
  hidden = false;
  constructor(public tag = "", public options: any = {}) {}
  createDiv(options: any) { return this.createEl("div", options); }
  createEl(tag: string, options: any = {}) {
    const child = new ElementStub(tag, options);
    this.children.push(child);
    return child;
  }
  addEventListener(name: string, callback: () => void) { this.events.set(name, callback); }
  toggleClass(_name: string, hidden: boolean) { this.hidden = hidden; }
}

function setup(theme: string) {
  const section = new ElementStub();
  const select = new ElementStub("select");
  select.value = theme;
  const list = vi.fn(() => [{ path: "paper.png" }, { path: "other.webp" }]);
  setupRow.call({ plugin: { getAvailablePaperImages: list } }, section, select,
    { customPaperImage: "paper.png" });
  return { row: section.children[0], select, list };
}

describe("writing panel paper image loading", () => {
  it("does not scan images when the row is hidden", () => {
    const { row, list } = setup("warm");
    expect(row.hidden).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });
  it("loads images and preserves the selected background for custom paper", () => {
    const { row, list } = setup("custom");
    const images = row.children.find((child) => child.tag === "select")!;
    expect(list).toHaveBeenCalledTimes(1);
    expect(images.children.map((child) => child.options.value)).toEqual(["", "paper.png", "other.webp"]);
    expect(images.value).toBe("paper.png");
  });
  it("loads once when switching to custom paper without rebuilding the panel", () => {
    const { row, select, list } = setup("warm");
    select.value = "custom";
    select.events.get("change")!();
    select.events.get("change")!();
    expect(row.hidden).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
