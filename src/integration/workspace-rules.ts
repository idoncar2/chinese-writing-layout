import { normalizeCssClassName } from "../layout-presets";
import { isFileInFolder, matchBasenameGlob } from "../file-matching";
import type { AutoApplyRule } from "../types";

export const WORKSPACE_RULES_PROTOCOL_VERSION = 1 as const;

export type WorkspaceRuleKind = "folder" | "tag" | "filename" | "css-class";

export interface WorkspaceApplyRule {
  id: string;
  kind: WorkspaceRuleKind;
  folderPath?: string;
  includeSubfolders?: boolean;
  tag?: string;
  pattern?: string;
  cssClass?: string;
}

export interface WorkspaceFileFacts {
  path: string;
  basename: string;
  tags: readonly string[];
  cssClasses: readonly string[];
}

export interface WorkspaceRulesApi {
  protocolVersion: number;
  getWorkspaceRules: () => readonly WorkspaceApplyRule[];
  subscribe: (listener: () => void) => () => void;
}

function normalizeFolderPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\\/gu, "/");
  if (/^\/+$/u.test(trimmed)) return "/";
  return trimmed.replace(/^\/+|\/+$/gu, "");
}

function normalizeTag(value: unknown): string {
  if (typeof value !== "string") return "";
  const tag = value.trim().replace(/^#+/u, "");
  return tag ? `#${tag}` : "";
}

export function normalizeWorkspaceRules(value: unknown): WorkspaceApplyRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<WorkspaceApplyRule>((candidate): WorkspaceApplyRule[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) return [];
    if (raw.kind === "folder") {
      const folderPath = normalizeFolderPath(raw.folderPath);
      return folderPath
        ? [{ id, kind: "folder", folderPath, includeSubfolders: raw.includeSubfolders !== false }]
        : [];
    }
    if (raw.kind === "tag") {
      const tag = normalizeTag(raw.tag);
      return tag ? [{ id, kind: "tag", tag }] : [];
    }
    if (raw.kind === "filename") {
      const pattern = typeof raw.pattern === "string" ? raw.pattern : "";
      return pattern.trim() ? [{ id, kind: "filename", pattern }] : [];
    }
    if (raw.kind === "css-class") {
      const cssClass = normalizeCssClassName(raw.cssClass);
      return cssClass ? [{ id, kind: "css-class", cssClass }] : [];
    }
    return [];
  });
}

export function toWorkspaceApplyRule(rule: AutoApplyRule): WorkspaceApplyRule {
  switch (rule.kind) {
    case "folder":
      return {
        id: rule.id,
        kind: "folder",
        folderPath: rule.folderPath,
        includeSubfolders: rule.includeSubfolders,
      };
    case "tag":
      return { id: rule.id, kind: "tag", tag: rule.tag };
    case "filename":
      return { id: rule.id, kind: "filename", pattern: rule.pattern };
    case "css-class":
      return { id: rule.id, kind: "css-class", cssClass: rule.cssClass };
  }
}

export function toWorkspaceApplyRules(rules: readonly AutoApplyRule[]): WorkspaceApplyRule[] {
  return normalizeWorkspaceRules(rules.map(toWorkspaceApplyRule));
}

export function matchesWorkspaceRule(facts: WorkspaceFileFacts, rule: WorkspaceApplyRule): boolean {
  switch (rule.kind) {
    case "folder":
      return Boolean(rule.folderPath)
        && isFileInFolder(facts.path, rule.folderPath ?? "", rule.includeSubfolders !== false);
    case "tag": {
      const expected = normalizeTag(rule.tag).toLocaleLowerCase("en-US");
      return Boolean(expected)
        && facts.tags.some((tag) => normalizeTag(tag).toLocaleLowerCase("en-US") === expected);
    }
    case "filename":
      return matchBasenameGlob(facts.basename, rule.pattern ?? "");
    case "css-class": {
      const expected = normalizeCssClassName(rule.cssClass);
      return Boolean(expected)
        && facts.cssClasses.some((cssClass) => normalizeCssClassName(cssClass) === expected);
    }
  }
}

export function matchesAnyWorkspaceRule(
  facts: WorkspaceFileFacts,
  rules: readonly WorkspaceApplyRule[],
): boolean {
  return rules.some((rule) => matchesWorkspaceRule(facts, rule));
}
