import { describe, expect, it } from "vitest";
import {
  isDocumentLayoutHistorySnapshot,
  isGlobalLayoutHistorySnapshot,
  LayoutHistoryManager,
  type LayoutChangeMeta,
  type DocumentLayoutHistorySnapshot,
  type GlobalLayoutHistorySnapshot,
  type LayoutHistorySnapshot,
} from "../src/layout-history";
import { DEFAULT_SETTINGS } from "../src/types";
import { normalizeLayoutPresetValues } from "../src/layout-presets";

const values = normalizeLayoutPresetValues(DEFAULT_SETTINGS);

function globalSnapshot(fontSize = values.fontSize): GlobalLayoutHistorySnapshot {
  return {
    target: { kind: "global" },
    layoutPreset: "default",
    values: { ...values, fontSize },
    obsidianOverrides: {},
  };
}

function documentSnapshot(
  path = "章节/第一章.md",
  documentLayout: DocumentLayoutHistorySnapshot["documentLayout"] = null,
): DocumentLayoutHistorySnapshot {
  return {
    target: { kind: "document", path },
    documentLayout,
    effectiveValues: { ...values },
  };
}

function fieldMeta(
  targetKey = "global",
  key: "fontSize" | "lineHeight" = "fontSize",
  timestamp?: number,
): LayoutChangeMeta {
  return {
    targetKey,
    mergeKey: `field:${key}`,
    summary: { kind: "field", key },
    timestamp,
  };
}

function asGlobal(snapshot: LayoutHistorySnapshot | undefined): GlobalLayoutHistorySnapshot {
  if (!snapshot || !isGlobalLayoutHistorySnapshot(snapshot)) {
    throw new Error("expected a global layout snapshot");
  }
  return snapshot;
}

function asDocument(snapshot: LayoutHistorySnapshot | undefined): DocumentLayoutHistorySnapshot {
  if (!snapshot || !isDocumentLayoutHistorySnapshot(snapshot)) {
    throw new Error("expected a document layout snapshot");
  }
  return snapshot;
}

describe("layout history", () => {
  it("creates one record after a changed transaction", () => {
    const history = new LayoutHistoryManager();

    history.begin(fieldMeta(), globalSnapshot(16));
    const record = history.commit(fieldMeta(), globalSnapshot(18));

    expect(record).not.toBeNull();
    expect(record?.before).toEqual(globalSnapshot(16));
    expect(record?.after).toEqual(globalSnapshot(18));
    expect(history.canUndo("global")).toBe(true);
    expect(history.canRedo("global")).toBe(false);
  });

  it("drops an unchanged preview and keeps redo history intact", async () => {
    const history = new LayoutHistoryManager();

    history.begin(fieldMeta(), globalSnapshot(16));
    history.commit(fieldMeta(), globalSnapshot(18));
    await history.undo("global", () => undefined);

    history.begin(fieldMeta(), globalSnapshot(16));
    expect(history.commit(fieldMeta(), globalSnapshot(16))).toBeNull();
    expect(history.canUndo("global")).toBe(false);
    expect(history.canRedo("global")).toBe(true);
  });

  it("undoes and redoes through cloned snapshots", async () => {
    const history = new LayoutHistoryManager();
    let current = globalSnapshot(18);
    history.begin(fieldMeta(), globalSnapshot(16));
    history.commit(fieldMeta(), current);

    const undone = await history.undo("global", (snapshot) => {
      current = asGlobal(snapshot);
    });
    expect(asGlobal(undone?.after).values.fontSize).toBe(18);
    expect(current.values.fontSize).toBe(16);

    const redone = await history.redo("global", (snapshot) => {
      current = asGlobal(snapshot);
    });
    expect(asGlobal(redone?.before).values.fontSize).toBe(16);
    expect(current.values.fontSize).toBe(18);
  });

  it("does not move a record when applying undo or redo fails", async () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta(), globalSnapshot(16));
    history.commit(fieldMeta(), globalSnapshot(18));

    await expect(history.undo("global", () => {
      throw new Error("apply failed");
    })).rejects.toThrow("apply failed");
    expect(history.canUndo("global")).toBe(true);
    expect(history.canRedo("global")).toBe(false);

    await history.undo("global", () => undefined);
    await expect(history.redo("global", () => {
      throw new Error("apply failed");
    })).rejects.toThrow("apply failed");
    expect(history.canUndo("global")).toBe(false);
    expect(history.canRedo("global")).toBe(true);
  });

  it("cancels a pending transaction without creating a record", () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta(), globalSnapshot(16));
    const before = history.cancel("global");

    expect(before).toEqual(globalSnapshot(16));
    expect(history.commit(fieldMeta(), globalSnapshot(18))).toBeNull();
    expect(history.canUndo("global")).toBe(false);
  });

  it("clears redo when a new changed transaction is committed", async () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta(), globalSnapshot(16));
    history.commit(fieldMeta(), globalSnapshot(18));
    await history.undo("global", () => undefined);

    history.begin(fieldMeta(), globalSnapshot(16));
    history.commit(fieldMeta(), globalSnapshot(20));

    expect(history.canRedo("global")).toBe(false);
    expect(history.canUndo("global")).toBe(true);
  });

  it("merges the same field within the interaction window", () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta("global", "fontSize", 1000), globalSnapshot(16));
    const first = history.commit(fieldMeta("global", "fontSize", 1000), globalSnapshot(17));
    history.begin(fieldMeta("global", "fontSize", 1200), globalSnapshot(17));
    const merged = history.commit(fieldMeta("global", "fontSize", 1500), globalSnapshot(19));

    expect(merged?.id).toBe(first?.id);
    expect(asGlobal(merged?.before).values.fontSize).toBe(16);
    expect(asGlobal(merged?.after).values.fontSize).toBe(19);
  });

  it("does not merge different fields or changes outside the window", () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta("global", "fontSize", 1000), globalSnapshot(16));
    const first = history.commit(fieldMeta("global", "fontSize", 1000), globalSnapshot(17));
    history.begin(fieldMeta("global", "lineHeight", 1200), globalSnapshot(17));
    const differentField = history.commit(fieldMeta("global", "lineHeight", 1500), globalSnapshot(19));
    history.begin(fieldMeta("global", "fontSize", 2500), globalSnapshot(19));
    const outsideWindow = history.commit(fieldMeta("global", "fontSize", 3301), globalSnapshot(20));

    expect(differentField?.id).not.toBe(first?.id);
    expect(outsideWindow?.id).not.toBe(differentField?.id);
  });

  it("keeps global and document targets isolated", async () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta("global"), globalSnapshot(16));
    history.commit(fieldMeta("global"), globalSnapshot(18));
    history.begin(fieldMeta("document:章节/第一章.md"), documentSnapshot());
    history.commit(fieldMeta("document:章节/第一章.md"), documentSnapshot("章节/第一章.md", {
      layoutPreset: "custom",
      values: { ...values, fontSize: 20 },
      obsidianOverrides: {},
    }));

    await history.undo("global", () => undefined);
    expect(history.canUndo("global")).toBe(false);
    expect(history.canUndo("document:章节/第一章.md")).toBe(true);
  });

  it("preserves the empty document snapshot and caps each session stack", () => {
    const history = new LayoutHistoryManager(2);
    for (const [index, fontSize] of [16, 18, 20].entries()) {
      const timestamp = index * 1000;
      history.begin(fieldMeta("global", "fontSize", timestamp), globalSnapshot(fontSize));
      history.commit(fieldMeta("global", "fontSize", timestamp), globalSnapshot(fontSize + 1));
    }

    expect(history.getUndoEntries("global")).toHaveLength(2);
    expect(asGlobal(history.getUndoEntries("global")[0]?.before).values.fontSize).toBe(18);

    history.begin(fieldMeta("document:章节/第一章.md"), documentSnapshot());
    const record = history.commit(fieldMeta("document:章节/第一章.md"), documentSnapshot(
      "章节/第一章.md",
      {
        layoutPreset: "custom",
        values: { ...values, fontSize: 22 },
        obsidianOverrides: {},
      },
    ));
    expect(asDocument(record?.before).documentLayout).toBeNull();
    expect(asDocument(record?.after).documentLayout).not.toBeNull();
  });

  it("does not share mutable data with callers or returned records", () => {
    const history = new LayoutHistoryManager();
    const before = globalSnapshot(16);
    const after = globalSnapshot(18);
    history.begin(fieldMeta(), before);
    const record = history.commit(fieldMeta(), after);

    before.values.fontSize = 99;
    after.values.fontSize = 100;
    if (record) asGlobal(record.after).values.fontSize = 101;

    expect(asGlobal(history.getUndoEntries("global")[0]?.before).values.fontSize).toBe(16);
    expect(asGlobal(history.getUndoEntries("global")[0]?.after).values.fontSize).toBe(18);
  });

  it("renames and clears document target prefixes", () => {
    const history = new LayoutHistoryManager();
    history.begin(fieldMeta("document:旧目录/第一章.md"), documentSnapshot("旧目录/第一章.md"));
    history.commit(fieldMeta("document:旧目录/第一章.md"), documentSnapshot("旧目录/第一章.md", {
      layoutPreset: "custom",
      values: { ...values, fontSize: 20 },
      obsidianOverrides: {},
    }));

    history.renameDocumentPathPrefix("旧目录", "新目录");
    expect(history.canUndo("document:新目录/第一章.md")).toBe(true);
    expect(history.findRecord("layout-1")?.record.after.target).toEqual({
      kind: "document",
      path: "新目录/第一章.md",
    });

    history.clearDocumentPathPrefix("新目录");
    expect(history.canUndo("document:新目录/第一章.md")).toBe(false);
  });
});
