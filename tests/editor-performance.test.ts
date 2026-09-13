import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

// Export the private renderer only in this test bundle; keep the production API small.
const bundle = buildSync({ stdin: {
  contents: readFileSync("src/editor-extension.ts", "utf8") + "\nexport { buildDecorations };",
  resolveDir: "src", loader: "ts",
}, bundle: true, write: false, platform: "node", format: "cjs", packages: "external" }).outputFiles[0].text;
const compiled = { exports: {} as any };
new Function("require", "module", "exports", bundle)(createRequire(import.meta.url), compiled, compiled.exports);
const { buildDecorations } = compiled.exports;

describe("editor analysis reuse", () => {
  it("reuses document analysis while scrolling and selecting, invalidating after edits", () => {
    const state = EditorState.create({ doc: "正文?\n\n下一段。\n".repeat(1000) });
    const read = vi.spyOn(state.doc, "toString");
    const view = { state, visibleRanges: [{ from: 0, to: 20 }] };
    buildDecorations(view);
    view.state = state.update({ selection: { anchor: 4 } }).state;
    buildDecorations(view);
    view.visibleRanges = [{ from: 100, to: 120 }];
    buildDecorations(view);
    expect(read).toHaveBeenCalledTimes(1);
    view.state = state.update({ changes: { from: 0, to: 3, insert: "正文。" } }).state;
    const updatedRead = vi.spyOn(view.state.doc, "toString");
    buildDecorations(view);
    expect(updatedRead).toHaveBeenCalledTimes(1);
  });

  it("keeps offscreen code/YAML context and the active empty prose line correct", () => {
    const doc = "---\ntitle: 文?\n---\n```\n代码?\n```\n正文?\n\n下一段。";
    const state = EditorState.create({ doc, selection: { anchor: doc.indexOf("\n\n") + 1 } });
    const result = buildDecorations({ state, visibleRanges: [{ from: doc.indexOf("代码"), to: doc.length }] });
    const ranges: Array<{ from: number; className: string }> = [];
    result.between(0, doc.length, (from: number, _to: number, value: any) => {
      ranges.push({ from, className: value.spec.class ?? value.spec.attributes.class });
    });
    expect(ranges.some((range) => range.from === doc.indexOf("代码"))).toBe(false);
    expect(ranges.some((range) => range.className.includes("cw-empty-prose-line"))).toBe(true);
    expect(ranges.filter((range) => range.className.includes("cw-diagnostic"))).toHaveLength(1);
  });
});
