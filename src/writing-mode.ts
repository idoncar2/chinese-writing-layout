import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type AutoApplyLayoutPresetId,
  type AutoApplyRule,
  type ChineseWritingSettings,
  type CustomLayoutPreset,
  type DocumentWritingMode,
  type LayoutPresetId,
} from "./types";
import {
  normalizeCssClassName,
  normalizeLayoutPresetId,
} from "./layout-presets";
import { isFileInFolder, matchBasenameGlob } from "./file-matching";

export { CURRENT_SETTINGS_SCHEMA_VERSION } from "./types";

export interface WritingFileFacts {
  path: string;
  basename: string;
  tags: readonly string[];
  cssClasses: readonly string[];
}

export type WritingActivationSource =
  | { kind: "document"; override: DocumentWritingMode }
  | { kind: "rule"; ruleId: string }
  | { kind: "legacy-activation-class"; cssClass: string }
  | { kind: "global-default" };

export type WritingLayoutSource =
  | { kind: "document" }
  | { kind: "rule"; ruleId: string }
  | { kind: "global-default" };

export interface ResolvedWritingContext {
  enabled: boolean;
  activationSource: WritingActivationSource;
  layoutPreset: LayoutPresetId;
  layoutSource: WritingLayoutSource;
  matchedRule: AutoApplyRule | null;
}

export interface NormalizedWritingModeSettings {
  settingsSchemaVersion: number;
  defaultWritingModeEnabled: boolean;
  autoApplyRules: AutoApplyRule[];
  documentWritingModes: Record<string, DocumentWritingMode>;
  autoTypewriterOnWritingMode: boolean;
  changed: boolean;
}

export function shouldAutoFormatOnManualWritingModeTransition(
  wasEnabled: boolean,
  isEnabled: boolean,
  settingEnabled: boolean,
): boolean {
  return settingEnabled && !wasEnabled && isEnabled;
}

function normalizeTag(value: unknown): string {
  if (typeof value !== "string") return "";
  const tag = value.trim().replace(/^#+/u, "");
  return tag ? `#${tag}` : "";
}

function normalizeFolderPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\\/gu, "/");
  if (/^\/+$/u.test(normalized)) return "/";
  return normalized.replace(/^\/+|\/+$/gu, "");
}

function normalizeRuleLayoutPreset(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): AutoApplyLayoutPresetId {
  const normalized = normalizeLayoutPresetId(value, presets);
  return normalized === "custom" ? "default" : normalized;
}

function normalizeRuleId(value: unknown, index: number, seen: Set<string>): string {
  const requested = typeof value === "string" && value.trim()
    ? value.trim()
    : `auto-rule-${index + 1}`;
  let id = requested;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${requested}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function normalizeAutoApplyRules(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): AutoApplyRule[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap<AutoApplyRule>((candidate, index): AutoApplyRule[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    const common = {
      id: normalizeRuleId(raw.id, index, seenIds),
      layoutPreset: normalizeRuleLayoutPreset(raw.layoutPreset, presets),
      activateWritingMode: typeof raw.activateWritingMode === "boolean"
        ? raw.activateWritingMode
        : true,
    };
    if (raw.kind === "folder") {
      if (typeof raw.folderPath !== "string") return [];
      const folderPath = normalizeFolderPath(raw.folderPath);
      if (!folderPath) return [];
      return [{
        ...common,
        kind: "folder" as const,
        folderPath,
        includeSubfolders: raw.includeSubfolders !== false,
      }];
    }
    if (raw.kind === "tag") {
      const tag = normalizeTag(raw.tag);
      return tag ? [{ ...common, kind: "tag" as const, tag }] : [];
    }
    if (raw.kind === "filename") {
      const pattern = typeof raw.pattern === "string" ? raw.pattern : "";
      return pattern.trim() ? [{ ...common, kind: "filename" as const, pattern }] : [];
    }
    if (raw.kind === "css-class") {
      const cssClass = normalizeCssClassName(raw.cssClass);
      return cssClass ? [{ ...common, kind: "css-class" as const, cssClass }] : [];
    }
    return [];
  });
}

function migrateLegacyCssRules(
  value: unknown,
  presets: readonly CustomLayoutPreset[],
): AutoApplyRule[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenClasses = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    const cssClass = normalizeCssClassName(raw.cssClass);
    if (!cssClass || seenClasses.has(cssClass)) return [];
    seenClasses.add(cssClass);
    return [{
      id: normalizeRuleId(raw.id, index, seenIds),
      kind: "css-class" as const,
      cssClass,
      layoutPreset: normalizeRuleLayoutPreset(raw.layoutPreset, presets),
      activateWritingMode: false,
    }];
  });
}

function normalizeDocumentWritingModes(value: unknown): Record<string, DocumentWritingMode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([path, mode]) => Boolean(path) && (mode === "force-on" || mode === "force-off")),
  ) as Record<string, DocumentWritingMode>;
}

export function normalizeWritingModeSettings(
  stored: unknown,
  presets: readonly CustomLayoutPreset[],
): NormalizedWritingModeSettings {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      defaultWritingModeEnabled: DEFAULT_SETTINGS.defaultWritingModeEnabled,
      autoApplyRules: [],
      documentWritingModes: {},
      autoTypewriterOnWritingMode: DEFAULT_SETTINGS.autoTypewriterOnWritingMode,
      changed: false,
    };
  }

  const raw = stored as Record<string, unknown>;
  const storedSchemaVersion = typeof raw.settingsSchemaVersion === "number"
    && Number.isFinite(raw.settingsSchemaVersion)
    ? raw.settingsSchemaVersion
    : 0;
  const usesUnifiedRules = storedSchemaVersion >= CURRENT_SETTINGS_SCHEMA_VERSION
    || Array.isArray(raw.autoApplyRules);
  const autoApplyRules = usesUnifiedRules
    ? normalizeAutoApplyRules(raw.autoApplyRules, presets)
    : migrateLegacyCssRules(raw.cssClassLayoutRules, presets);

  return {
    settingsSchemaVersion: Math.max(
      CURRENT_SETTINGS_SCHEMA_VERSION,
      storedSchemaVersion,
    ),
    defaultWritingModeEnabled: typeof raw.defaultWritingModeEnabled === "boolean"
      ? raw.defaultWritingModeEnabled
      : DEFAULT_SETTINGS.defaultWritingModeEnabled,
    autoApplyRules,
    documentWritingModes: normalizeDocumentWritingModes(raw.documentWritingModes),
    autoTypewriterOnWritingMode: typeof raw.autoTypewriterOnWritingMode === "boolean"
      ? raw.autoTypewriterOnWritingMode
      : DEFAULT_SETTINGS.autoTypewriterOnWritingMode,
    changed: storedSchemaVersion < CURRENT_SETTINGS_SCHEMA_VERSION,
  };
}

function ruleMatches(facts: WritingFileFacts, rule: AutoApplyRule): boolean {
  switch (rule.kind) {
    case "folder":
      return Boolean(rule.folderPath)
        && isFileInFolder(facts.path, rule.folderPath, rule.includeSubfolders);
    case "tag": {
      const expected = normalizeTag(rule.tag).toLocaleLowerCase("en-US");
      return Boolean(expected)
        && facts.tags.some((tag) => normalizeTag(tag).toLocaleLowerCase("en-US") === expected);
    }
    case "filename":
      return matchBasenameGlob(facts.basename, rule.pattern);
    case "css-class": {
      const expected = normalizeCssClassName(rule.cssClass);
      if (!expected) return false;
      const available = new Set(facts.cssClasses.map(normalizeCssClassName));
      return available.has(expected);
    }
  }
}

export function findFirstMatchingRule(
  facts: WritingFileFacts,
  rules: readonly AutoApplyRule[],
): AutoApplyRule | null {
  return rules.find((rule) => ruleMatches(facts, rule)) ?? null;
}

export function resolveWritingContext(
  facts: WritingFileFacts,
  settings: ChineseWritingSettings,
): ResolvedWritingContext {
  const matchedRule = findFirstMatchingRule(facts, settings.autoApplyRules);
  const documentOverride = settings.documentWritingModes[facts.path];

  let enabled: boolean;
  let activationSource: WritingActivationSource;
  if (documentOverride === "force-on" || documentOverride === "force-off") {
    enabled = documentOverride === "force-on";
    activationSource = { kind: "document", override: documentOverride };
  } else if (matchedRule?.activateWritingMode) {
    enabled = true;
    activationSource = { kind: "rule", ruleId: matchedRule.id };
  } else {
    const activationClass = normalizeCssClassName(settings.activationClass);
    const hasLegacyActivationClass = Boolean(
      activationClass
      && facts.cssClasses.some((cssClass) => normalizeCssClassName(cssClass) === activationClass),
    );
    if (hasLegacyActivationClass) {
      enabled = true;
      activationSource = {
        kind: "legacy-activation-class",
        cssClass: activationClass,
      };
    } else {
      enabled = settings.defaultWritingModeEnabled;
      activationSource = { kind: "global-default" };
    }
  }

  const documentLayout = settings.documentLayouts[facts.path];
  const layoutPreset = documentLayout?.layoutPreset
    ?? matchedRule?.layoutPreset
    ?? settings.layoutPreset;
  const layoutSource: WritingLayoutSource = documentLayout
    ? { kind: "document" }
    : matchedRule
      ? { kind: "rule", ruleId: matchedRule.id }
      : { kind: "global-default" };

  return {
    enabled,
    activationSource,
    layoutPreset,
    layoutSource,
    matchedRule,
  };
}
