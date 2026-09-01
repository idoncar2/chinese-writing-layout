import type { WorkspaceRulesApi } from "./workspace-rules";

export const WRITING_TOOLS_MODULES_CHANGED_EVENT = "writing-tools:modules-changed";

export const WRITING_LAYOUT_CAPABILITIES = [
  "writing-context.read",
  "writing-context.subscribe",
  "workspace.rules.read",
  "workspace.rules.subscribe",
  "views.open",
  "formatting.open",
  "export.open",
] as const;

export interface WritingContextSummary {
  filePath: string;
  enabled: boolean;
  layoutPreset: string;
  layoutLabel: string;
  activationSource: string;
  layoutSource: string;
}

export interface WritingLayoutModuleApi {
  meta: {
    moduleId: "chinese-writing-layout";
    moduleVersion: string;
    protocolVersion: 1;
    capabilities: typeof WRITING_LAYOUT_CAPABILITIES;
  };
  getCurrentWritingContext: () => WritingContextSummary | null;
  subscribe: (listener: () => void) => () => void;
  openStudio: () => void | Promise<void>;
  openFormatting: () => void | Promise<void>;
  openExport: () => void | Promise<void>;
  workspaceRules?: WorkspaceRulesApi;
}

export interface WritingToolsGlobal {
  __writingToolsModules?: Record<string, WritingLayoutModuleApi>;
  dispatchEvent?: (event: Event) => boolean;
}

export interface WritingLayoutModuleDependencies {
  moduleVersion: string;
  getCurrentWritingContext: () => WritingContextSummary | null;
  subscribe: (listener: () => void) => () => void;
  openStudio: () => void | Promise<void>;
  openFormatting: () => void | Promise<void>;
  openExport: () => void | Promise<void>;
  workspaceRules?: WorkspaceRulesApi;
}

export function createWritingLayoutModuleApi(
  dependencies: WritingLayoutModuleDependencies,
): WritingLayoutModuleApi {
  return {
    meta: {
      moduleId: "chinese-writing-layout",
      moduleVersion: dependencies.moduleVersion,
      protocolVersion: 1,
      capabilities: WRITING_LAYOUT_CAPABILITIES,
    },
    getCurrentWritingContext: () => {
      const context = dependencies.getCurrentWritingContext();
      return context ? { ...context } : null;
    },
    subscribe: dependencies.subscribe,
    openStudio: dependencies.openStudio,
    openFormatting: dependencies.openFormatting,
    openExport: dependencies.openExport,
    ...(dependencies.workspaceRules ? { workspaceRules: dependencies.workspaceRules } : {}),
  };
}

function announceModuleChange(
  host: WritingToolsGlobal,
  action: "registered" | "unregistered",
): void {
  host.dispatchEvent?.(new CustomEvent(WRITING_TOOLS_MODULES_CHANGED_EVENT, {
    detail: { moduleId: "chinese-writing-layout", action },
  }));
}

export function registerWritingModule(
  host: WritingToolsGlobal,
  api: WritingLayoutModuleApi,
): () => void {
  const registry = host.__writingToolsModules ?? {};
  host.__writingToolsModules = registry;
  registry[api.meta.moduleId] = api;
  announceModuleChange(host, "registered");
  return () => {
    if (registry[api.meta.moduleId] !== api) return;
    delete registry[api.meta.moduleId];
    announceModuleChange(host, "unregistered");
  };
}
