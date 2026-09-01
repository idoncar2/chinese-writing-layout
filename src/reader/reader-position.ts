import type { ReaderAnchor, ReaderPosition } from "../types";

export interface ReaderBlockSource {
  textContent?: string | null;
}

export interface ReaderBlockDescriptor {
  index: number;
  text: string;
  hash: string;
}

function normalizeBlockText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createReaderBlockDescriptors(
  blocks: readonly ReaderBlockSource[],
): ReaderBlockDescriptor[] {
  return blocks.map((block, index) => {
    const text = normalizeBlockText(block.textContent);
    return { index, text, hash: hashText(text) };
  });
}

export function resolveReaderBlockIndex(
  blocks: readonly ReaderBlockDescriptor[],
  anchor: ReaderAnchor,
): number {
  if (blocks.length === 0) return 0;
  if (anchor.blockHash) {
    const byHash = blocks.findIndex((block) => block.hash === anchor.blockHash);
    if (byHash >= 0) return byHash;
  }
  return Math.min(blocks.length - 1, Math.max(0, Math.floor(anchor.blockIndex)));
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeReaderPositions(value: unknown): Record<string, ReaderPosition> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, ReaderPosition> = {};
  for (const [path, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as {
      anchor?: unknown;
      updatedAt?: unknown;
    };
    if (!raw.anchor || typeof raw.anchor !== "object" || Array.isArray(raw.anchor)) continue;
    const anchor = raw.anchor as {
      blockIndex?: unknown;
      blockHash?: unknown;
      textOffset?: unknown;
      documentProgress?: unknown;
    };
    const blockIndex = Math.max(
      0,
      Math.floor(normalizeFiniteNumber(anchor.blockIndex, 0)),
    );
    const textOffset = Math.max(
      0,
      Math.floor(normalizeFiniteNumber(anchor.textOffset, 0)),
    );
    const documentProgress = Math.min(
      1,
      Math.max(0, normalizeFiniteNumber(anchor.documentProgress, 0)),
    );
    result[path] = {
      anchor: {
        blockIndex,
        ...(typeof anchor.blockHash === "string" && anchor.blockHash
          ? { blockHash: anchor.blockHash }
          : {}),
        textOffset,
        documentProgress,
      },
      updatedAt: Math.max(0, normalizeFiniteNumber(raw.updatedAt, 0)),
    };
  }
  return result;
}

export function getReaderBlockElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    "h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, pre, table, hr, img, .internal-embed",
  )).filter((element) => !element.parentElement?.closest("blockquote"));
}
