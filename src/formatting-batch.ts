import type {
  FormattingPresetId,
  FormattingRuleKey,
  FormattingRules,
  MarkdownFormattingOptions,
} from "./types";
import { isFileInFolder } from "./file-matching";

export { isFileInFolder };

export interface BatchFormattingRequest {
  preset: FormattingPresetId;
  rules: FormattingRules;
  ruleOrder: FormattingRuleKey[];
  markdownFormatting: MarkdownFormattingOptions;
}

export interface BatchFormattingSnapshot {
  path: string;
  before: string;
  after: string;
}

export interface BatchFormattingUndoState {
  snapshots: BatchFormattingSnapshot[];
}

export interface BatchFormattingResult {
  processed: number;
  changed: number;
  failedPaths: string[];
}

export interface BatchFormattingUndoResult {
  restored: number;
  skipped: number;
}

export function isFileInFormattingFolder(
  filePath: string,
  folderPath: string,
  includeSubfolders: boolean,
): boolean {
  return isFileInFolder(filePath, folderPath, includeSubfolders);
}

export function canRestoreBatchSnapshot(
  currentContent: string,
  snapshot: BatchFormattingSnapshot,
): boolean {
  return currentContent === snapshot.after;
}
