import type {
  DocumentLayoutSettings,
  LayoutPresetId,
  LayoutPresetOverrides,
  LayoutPresetValues,
} from "./types";

export type LayoutHistorySnapshot =
  | GlobalLayoutHistorySnapshot
  | DocumentLayoutHistorySnapshot;

export interface GlobalLayoutHistorySnapshot {
  target: { kind: "global" };
  layoutPreset: LayoutPresetId;
  values: LayoutPresetValues;
  obsidianOverrides: LayoutPresetOverrides;
}

export interface DocumentLayoutHistorySnapshot {
  target: { kind: "document"; path: string };
  documentLayout: DocumentLayoutSettings | null;
  effectiveValues: LayoutPresetValues;
}

export type LayoutChangeSummary =
  | { kind: "field"; key: keyof LayoutPresetValues }
  | { kind: "template"; presetName: string }
  | { kind: "reset" }
  | { kind: "save-as"; presetName: string }
  | { kind: "history-restore"; sourceTimestamp: number };

export interface LayoutChangeMeta {
  targetKey: string;
  mergeKey?: string;
  summary: LayoutChangeSummary;
  timestamp?: number;
}

export interface LayoutChangeRecord {
  id: string;
  timestamp: number;
  targetKey: string;
  mergeKey?: string;
  summary: LayoutChangeSummary;
  before: LayoutHistorySnapshot;
  after: LayoutHistorySnapshot;
}

interface PendingLayoutChange {
  meta: LayoutChangeMeta;
  before: LayoutHistorySnapshot;
}

interface LayoutHistoryTargetState {
  undoStack: LayoutChangeRecord[];
  redoStack: LayoutChangeRecord[];
  pending?: PendingLayoutChange;
}

export const LAYOUT_HISTORY_MERGE_WINDOW_MS = 700;
export const MAX_LAYOUT_HISTORY_ENTRIES = 50;

export function cloneLayoutHistorySnapshot(
  snapshot: LayoutHistorySnapshot,
): LayoutHistorySnapshot {
  return clone(snapshot);
}

export function isGlobalLayoutHistorySnapshot(
  snapshot: LayoutHistorySnapshot,
): snapshot is GlobalLayoutHistorySnapshot {
  return snapshot.target.kind === "global";
}

export function isDocumentLayoutHistorySnapshot(
  snapshot: LayoutHistorySnapshot,
): snapshot is DocumentLayoutHistorySnapshot {
  return snapshot.target.kind === "document";
}

export class LayoutHistoryManager {
  private readonly targets = new Map<string, LayoutHistoryTargetState>();
  private nextId = 1;

  constructor(
    private readonly maxEntries = MAX_LAYOUT_HISTORY_ENTRIES,
    private readonly mergeWindowMs = LAYOUT_HISTORY_MERGE_WINDOW_MS,
  ) {}

  begin(meta: LayoutChangeMeta, before: LayoutHistorySnapshot): void {
    const state = this.getOrCreateState(meta.targetKey);
    state.pending = {
      meta: { ...meta },
      before: clone(before),
    };
  }

  commit(
    meta: LayoutChangeMeta,
    after: LayoutHistorySnapshot,
  ): LayoutChangeRecord | null {
    const state = this.targets.get(meta.targetKey);
    const pending = state?.pending;
    if (!state || !pending) return null;
    state.pending = undefined;

    if (snapshotsEqual(pending.before, after)) return null;

    const timestamp = meta.timestamp ?? Date.now();
    const finalMeta = {
      ...pending.meta,
      ...meta,
      targetKey: pending.meta.targetKey,
    };
    const last = state.undoStack[state.undoStack.length - 1];
    if (
      last
      && last.mergeKey
      && finalMeta.mergeKey
      && last.mergeKey === finalMeta.mergeKey
      && Math.abs(timestamp - last.timestamp) <= this.mergeWindowMs
    ) {
      last.after = clone(after);
      last.timestamp = timestamp;
      state.redoStack = [];
      return clone(last);
    }

    const record: LayoutChangeRecord = {
      id: `layout-${this.nextId++}`,
      timestamp,
      targetKey: pending.meta.targetKey,
      mergeKey: finalMeta.mergeKey,
      summary: clone(finalMeta.summary),
      before: clone(pending.before),
      after: clone(after),
    };
    state.undoStack.push(record);
    if (state.undoStack.length > this.maxEntries) {
      state.undoStack.splice(0, state.undoStack.length - this.maxEntries);
    }
    state.redoStack = [];
    return clone(record);
  }

  cancel(targetKey: string): LayoutHistorySnapshot | null {
    const state = this.targets.get(targetKey);
    const pending = state?.pending;
    if (!state || !pending) return null;
    state.pending = undefined;
    return clone(pending.before);
  }

  async undo(
    targetKey: string,
    apply: (snapshot: LayoutHistorySnapshot) => void | Promise<void>,
  ): Promise<LayoutChangeRecord | null> {
    const state = this.targets.get(targetKey);
    const record = state?.undoStack[state.undoStack.length - 1];
    if (!state || !record) return null;
    await apply(clone(record.before));
    state.undoStack.pop();
    state.redoStack.push(record);
    return clone(record);
  }

  async redo(
    targetKey: string,
    apply: (snapshot: LayoutHistorySnapshot) => void | Promise<void>,
  ): Promise<LayoutChangeRecord | null> {
    const state = this.targets.get(targetKey);
    const record = state?.redoStack[state.redoStack.length - 1];
    if (!state || !record) return null;
    await apply(clone(record.after));
    state.redoStack.pop();
    state.undoStack.push(record);
    if (state.undoStack.length > this.maxEntries) {
      state.undoStack.splice(0, state.undoStack.length - this.maxEntries);
    }
    return clone(record);
  }

  canUndo(targetKey: string): boolean {
    return (this.targets.get(targetKey)?.undoStack.length ?? 0) > 0;
  }

  canRedo(targetKey: string): boolean {
    return (this.targets.get(targetKey)?.redoStack.length ?? 0) > 0;
  }

  getUndoEntries(targetKey: string): LayoutChangeRecord[] {
    return (this.targets.get(targetKey)?.undoStack ?? []).map((record) => clone(record));
  }

  getRedoEntries(targetKey: string): LayoutChangeRecord[] {
    return (this.targets.get(targetKey)?.redoStack ?? []).map((record) => clone(record));
  }

  findRecord(id: string): { record: LayoutChangeRecord; targetKey: string } | null {
    for (const [targetKey, state] of this.targets) {
      const record = [...state.undoStack, ...state.redoStack].find((entry) => entry.id === id);
      if (record) return { record: clone(record), targetKey };
    }
    return null;
  }

  clear(targetKey?: string): void {
    if (targetKey === undefined) {
      this.targets.clear();
      return;
    }
    this.targets.delete(targetKey);
  }

  renameTarget(fromTargetKey: string, toTargetKey: string): void {
    if (fromTargetKey === toTargetKey) return;
    const state = this.targets.get(fromTargetKey);
    if (!state) return;
    this.targets.delete(fromTargetKey);
    this.targets.set(toTargetKey, state);
    for (const record of [...state.undoStack, ...state.redoStack]) {
      record.targetKey = toTargetKey;
      record.before = remapSnapshotPath(record.before, toTargetKey);
      record.after = remapSnapshotPath(record.after, toTargetKey);
    }
    if (state.pending) {
      state.pending.meta = { ...state.pending.meta, targetKey: toTargetKey };
      state.pending.before = remapSnapshotPath(state.pending.before, toTargetKey);
    }
  }

  renameDocumentPathPrefix(fromPath: string, toPath: string): void {
    const prefix = "document:";
    const fromPrefix = `${prefix}${fromPath}`;
    const targets = [...this.targets.keys()].filter(
      (targetKey) => targetKey === fromPrefix || targetKey.startsWith(`${fromPrefix}/`),
    );
    for (const targetKey of targets) {
      const suffix = targetKey.slice(fromPrefix.length);
      this.renameTarget(targetKey, `${prefix}${toPath}${suffix}`);
    }
  }

  clearDocumentPathPrefix(path: string): void {
    const prefix = `document:${path}`;
    for (const targetKey of [...this.targets.keys()]) {
      if (targetKey === prefix || targetKey.startsWith(`${prefix}/`)) {
        this.targets.delete(targetKey);
      }
    }
  }

  private getOrCreateState(targetKey: string): LayoutHistoryTargetState {
    const existing = this.targets.get(targetKey);
    if (existing) return existing;
    const state: LayoutHistoryTargetState = { undoStack: [], redoStack: [] };
    this.targets.set(targetKey, state);
    return state;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotsEqual(
  left: LayoutHistorySnapshot,
  right: LayoutHistorySnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function remapSnapshotPath(
  snapshot: LayoutHistorySnapshot,
  targetKey: string,
): LayoutHistorySnapshot {
  if (!isDocumentLayoutHistorySnapshot(snapshot) || !targetKey.startsWith("document:")) {
    return snapshot;
  }
  return {
    target: {
      kind: "document",
      path: targetKey.slice("document:".length),
    },
    documentLayout: snapshot.documentLayout,
    effectiveValues: snapshot.effectiveValues,
  };
}
