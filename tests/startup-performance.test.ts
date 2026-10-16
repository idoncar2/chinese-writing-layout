import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

class MarkdownView {}
const host = {
  Plugin: class {}, ItemView: class {}, FileView: class {}, Modal: class {}, PluginSettingTab: class {},
  MarkdownView, TFile: class {}, TFolder: class {}, FileSystemAdapter: class {},
  Notice: class {}, Platform: {}, Setting: class {}, MarkdownRenderer: {},
  setIcon: vi.fn(), getAllTags: () => [], normalizePath: (path: string) => path,
};
const bundle = buildSync({ stdin: { contents: readFileSync("src/main.ts", "utf8") + "\nexport { WritingPanelView };",
  resolveDir: "src", loader: "ts" }, bundle: true, write: false,
  platform: "node", format: "cjs", packages: "external" }).outputFiles[0].text;
const compiled = { exports: {} as any };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", bundle)(
  (name: string) => name === "obsidian" ? host : require(name), compiled, compiled.exports,
);
const Plugin = compiled.exports.default;
// Exercise the real lifecycle with only Obsidian's host/UI boundary stubbed.
async function setup() {
  const plugin = new Plugin() as any;
  const events = new Map<string, (...args: any[]) => void>();
  const file = { path: "open.md" };
  const leaf = { view: Object.assign(new MarkdownView(), { file }) };
  plugin.app = {
    workspace: {
      layoutReady: true,
      on: (name: string, callback: (...args: any[]) => void) => events.set(name, callback),
      onLayoutReady: vi.fn(), getLeavesOfType: () => [leaf],
    },
    metadataCache: { on: (_: string, callback: (...args: any[]) => void) => events.set("metadata", callback) },
    vault: { on: vi.fn() },
  };
  for (const name of ["loadSettings", "migrateLegacyUserFonts", "loadUserFonts", "registerModuleApi",
    "addSettingTab", "registerEditorExtension", "registerMarkdownPostProcessor", "registerView",
    "addCommand", "addRibbonIcon", "syncQuickFormattingRibbonVisibility", "registerDomEvent", "registerEvent",
    "syncAllViews", "refreshWritingPanels", "updateStatusBar"]) plugin[name] = vi.fn();
  plugin.addStatusBarItem = () => ({ addClass() {}, setAttribute() {} });
  plugin.getWritingMarkdownView = () => leaf.view;
  await plugin.onload();
  return { plugin, events, file, leaf };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("layout width while adjusting typography", () => {
  it.each(["custom", "obsidian"])("keeps the %s layout width until the width slider is changed", (layoutPreset) => {
    const plugin = new Plugin() as any;
    const values = { ...plugin.settings, fontSize: 18, contentWidth: 42 };
    delete values.contentWidthPx;
    const layout = { layoutPreset, values, obsidianOverrides: { contentWidth: 42 } as any };
    plugin.getWritingMarkdownView = () => ({ file: { path: "width.md" } });
    plugin.ensureDocumentLayoutForCurrentFile = () => layout;
    plugin.getCurrentLayoutSettings = () => layoutPreset === "obsidian" ? { ...values, ...layout.obsidianOverrides } : { ...values };
    plugin.syncAllViews = vi.fn();
    const target = layoutPreset === "obsidian" ? layout.obsidianOverrides : values;

    plugin.previewLayoutSettings({ fontSize: 28 });
    expect(target.contentWidthPx).toBe(756);
    plugin.previewLayoutSettings({ fontSize: 16, letterSpacing: 1 });
    expect(target.contentWidthPx).toBe(756);
    plugin.previewLayoutSettings({ contentWidth: 50 });
    expect(target.contentWidthPx).toBe(800);
  });

  it("resolves the same pixel width independently of editor and reading font inheritance", () => {
    const plugin = new Plugin() as any;
    const properties = new Map<string, string>();
    const target = { style: { removeProperty: (name: string) => properties.delete(name), setProperty: (name: string, value: string) => properties.set(name, value) } };
    plugin.applyHeadingSizeVariables = vi.fn();
    plugin.app = { vault: { getAbstractFileByPath: () => null } };
    plugin.applyLayoutVariables(target, { ...plugin.settings, contentWidth: 42, fontSize: 18 });
    expect(properties.get("--cw-content-width")).toBe("756px");
  });
});

describe("startup refresh work", () => {
  it("loads a selected imported font when only a reader view is open", () => {
    const plugin = new Plugin() as any;
    const font = { id: "cw-user-reader", name: "Reader", fileName: "reader.ttf", originalFileName: "reader.ttf", format: "ttf" };
    plugin.settings.userFonts = [font];
    plugin.settings.readerSettings = { ...plugin.settings.readerSettings, font: { source: "user", id: font.id } };
    plugin.app = { workspace: { getLeavesOfType: (type: string) => type === "chinese-writing-reader" ? [{}] : [] } };
    plugin.ensureUserFontLoaded = vi.fn();
    plugin.syncNeededUserFonts();
    expect(plugin.ensureUserFontLoaded).toHaveBeenCalledWith(font.id);
  });

  it("keeps a font selectable before loading but flags it after its file is missing", async () => {
    const plugin = new Plugin() as any;
    const font = { id: "cw-user-missing", name: "Missing", fileName: "missing.ttf", originalFileName: "missing.ttf", format: "ttf" };
    plugin.settings.userFonts = [font];
    plugin.app = { vault: { adapter: { exists: async () => false } } };
    plugin.ensureFontMigration = async () => {};
    vi.stubGlobal("document", { fonts: { add() {} } });
    vi.stubGlobal("FontFace", class {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(plugin.getAvailableUserFontIds().has(font.id)).toBe(true);
    await plugin.ensureUserFontLoaded(font.id);
    expect(plugin.getAvailableUserFontIds().has(font.id)).toBe(false);
    warn.mockRestore();
  });

  it("ignores metadata indexing of unopened notes", async () => {
    const { plugin, events } = await setup();
    for (let index = 0; index < 1000; index++) events.get("metadata")!({ path: `other-${index}.md` });
    vi.runAllTimers();
    expect(plugin.syncAllViews).not.toHaveBeenCalled();
    expect(plugin.updateStatusBar).not.toHaveBeenCalled();
  });

  it("combines file, layout and open-note metadata events into one refresh", async () => {
    const { plugin, events, file } = await setup();
    for (let index = 0; index < 20; index++) {
      events.get("file-open")!();
      events.get("layout-change")!();
      events.get("metadata")!(file);
    }
    vi.runAllTimers();
    expect(plugin.syncAllViews).toHaveBeenCalledTimes(1);
    expect(plugin.refreshWritingPanels).toHaveBeenCalledTimes(1);
    expect(plugin.updateStatusBar).toHaveBeenCalledTimes(1);
  });

  it("leaves layout restoration to onLayoutReady", async () => {
    const { plugin, events } = await setup();
    plugin.app.workspace.layoutReady = false;
    events.get("layout-change")!();
    vi.runAllTimers();
    expect(plugin.syncAllViews).not.toHaveBeenCalled();
  });

  it("preserves the panel DOM when its first click activates the sidebar", async () => {
    const { plugin, events } = await setup();
    events.get("active-leaf-change")!({ view: Object.create(compiled.exports.WritingPanelView.prototype) });
    vi.runAllTimers();
    expect(plugin.syncAllViews).toHaveBeenCalledTimes(1);
    expect(plugin.refreshWritingPanels).not.toHaveBeenCalled();
  });

  it("handles later refreshes and cancels queued work on unload", async () => {
    const { plugin, events } = await setup();
    events.get("layout-change")!();
    vi.runAllTimers();
    events.get("layout-change")!();
    vi.runAllTimers();
    expect(plugin.syncAllViews).toHaveBeenCalledTimes(2);
    events.get("layout-change")!();
    for (const name of ["removeGlobalStyles", "unloadUserFonts", "toggleFocusMode", "clearViewClasses"]) {
      plugin[name] = vi.fn();
    }
    plugin.onunload();
    vi.runAllTimers();
    expect(plugin.syncAllViews).toHaveBeenCalledTimes(2);
  });

  it("does not read or analyze the document while the status bar is disabled", () => {
    const plugin = new Plugin() as any;
    plugin.settings.showStatusBar = false;
    plugin.statusBarItem = { toggleClass: vi.fn(), setText: vi.fn(), setAttribute: vi.fn() };
    const getValue = vi.fn(() => "正文");
    plugin.getWritingMarkdownView = () => ({ file: {}, editor: { getValue } });
    plugin.isNovelFile = () => true;
    plugin.updateStatusBar();
    expect(getValue).not.toHaveBeenCalled();
  });
});
