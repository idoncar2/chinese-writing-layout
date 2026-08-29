import { describe, expect, it } from "vitest";
import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  findFirstMatchingRule,
  normalizeWritingModeSettings,
  resolveWritingContext,
  type WritingFileFacts,
} from "../src/writing-mode";
import {
  DEFAULT_SETTINGS,
  type AutoApplyRule,
  type ChineseWritingSettings,
  type DocumentLayoutSettings,
} from "../src/types";
import { normalizeLayoutPresetValues } from "../src/layout-presets";

const baseFacts: WritingFileFacts = {
  path: "小说/塔昼/正文/第十二章.md",
  basename: "第十二章",
  tags: [],
  cssClasses: [],
};

function makeSettings(
  patch: Partial<ChineseWritingSettings> = {},
): ChineseWritingSettings {
  return {
    ...DEFAULT_SETTINGS,
    documentWritingModes: {},
    documentLayouts: {},
    autoApplyRules: [],
    ...patch,
  };
}

function makeRule(
  patch: Partial<AutoApplyRule> = {},
): AutoApplyRule {
  return {
    id: "folder-rule",
    kind: "folder",
    folderPath: "小说/塔昼/正文",
    includeSubfolders: true,
    layoutPreset: "default",
    activateWritingMode: true,
    ...patch,
  } as AutoApplyRule;
}

function makeDocumentLayout(
  layoutPreset: DocumentLayoutSettings["layoutPreset"],
): DocumentLayoutSettings {
  return {
    layoutPreset,
    values: normalizeLayoutPresetValues({ fontSize: 21 }),
    obsidianOverrides: {},
  };
}

describe("writing mode resolver", () => {
  it("uses the global defaults when no document state or rule matches", () => {
    const disabled = resolveWritingContext(baseFacts, makeSettings());
    expect(disabled.enabled).toBe(false);
    expect(disabled.activationSource.kind).toBe("global-default");
    expect(disabled.layoutPreset).toBe("default");
    expect(disabled.layoutSource.kind).toBe("global-default");

    const enabled = resolveWritingContext(baseFacts, makeSettings({
      defaultWritingModeEnabled: true,
      layoutPreset: "obsidian",
    }));
    expect(enabled.enabled).toBe(true);
    expect(enabled.layoutPreset).toBe("obsidian");
  });

  it("lets a document force-on or force-off override every activation source", () => {
    const rule = makeRule();
    const forceOff = resolveWritingContext(baseFacts, makeSettings({
      defaultWritingModeEnabled: true,
      autoApplyRules: [rule],
      documentWritingModes: { [baseFacts.path]: "force-off" },
    }));
    expect(forceOff.enabled).toBe(false);
    expect(forceOff.activationSource).toEqual({
      kind: "document",
      override: "force-off",
    });
    expect(forceOff.layoutSource).toEqual({ kind: "rule", ruleId: rule.id });

    const forceOn = resolveWritingContext(baseFacts, makeSettings({
      documentWritingModes: { [baseFacts.path]: "force-on" },
      autoApplyRules: [rule],
    }));
    expect(forceOn.enabled).toBe(true);
    expect(forceOn.activationSource).toEqual({
      kind: "document",
      override: "force-on",
    });
    expect(forceOn.layoutSource).toEqual({ kind: "rule", ruleId: rule.id });
  });

  it("uses only the first matching automatic rule", () => {
    const legacyLayoutOnly = makeRule({
      id: "legacy-scene",
      kind: "css-class",
      cssClass: "scene-romance",
      layoutPreset: "obsidian",
      activateWritingMode: false,
    });
    const folder = makeRule({ id: "later-folder" });
    const facts = {
      ...baseFacts,
      cssClasses: ["scene-romance"],
    };

    expect(findFirstMatchingRule(facts, [legacyLayoutOnly, folder])?.id)
      .toBe("legacy-scene");
    const resolved = resolveWritingContext(
      facts,
      makeSettings({ autoApplyRules: [legacyLayoutOnly, folder] }),
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.layoutPreset).toBe("obsidian");
    expect(resolved.matchedRule?.id).toBe("legacy-scene");
  });

  it("keeps activationClass as a compatibility activation source", () => {
    const resolved = resolveWritingContext(
      { ...baseFacts, cssClasses: ["chinese-novel", "scene-romance"] },
      makeSettings({
        autoApplyRules: [makeRule({
          id: "legacy-scene",
          kind: "css-class",
          cssClass: "scene-romance",
          layoutPreset: "obsidian",
          activateWritingMode: false,
        })],
      }),
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.activationSource).toEqual({
      kind: "legacy-activation-class",
      cssClass: "chinese-novel",
    });
    expect(resolved.layoutPreset).toBe("obsidian");
  });

  it("matches tag and filename rules without reading Markdown content", () => {
    const tagRule = makeRule({
      id: "tag-rule",
      kind: "tag",
      tag: "#小说",
      layoutPreset: "obsidian",
    });
    const filenameRule = makeRule({
      id: "filename-rule",
      kind: "filename",
      pattern: "第*章",
    });

    const tagged = resolveWritingContext(
      { ...baseFacts, basename: "序言", tags: ["#小说"] },
      makeSettings({ autoApplyRules: [tagRule, filenameRule] }),
    );
    expect(tagged.matchedRule?.id).toBe("tag-rule");
    expect(tagged.layoutPreset).toBe("obsidian");

    const named = resolveWritingContext(
      baseFacts,
      makeSettings({ autoApplyRules: [tagRule, filenameRule] }),
    );
    expect(named.matchedRule?.id).toBe("filename-rule");
    expect(named.enabled).toBe(true);
  });

  it("does not match a newly added folder rule before a folder is selected", () => {
    const incomplete = makeRule({ folderPath: "" });
    const resolved = resolveWritingContext(
      baseFacts,
      makeSettings({ autoApplyRules: [incomplete] }),
    );

    expect(resolved.matchedRule).toBeNull();
    expect(resolved.enabled).toBe(false);
  });

  it("keeps documentLayouts independent and above automatic templates", () => {
    const resolved = resolveWritingContext(baseFacts, makeSettings({
      autoApplyRules: [makeRule({ layoutPreset: "obsidian" })],
      documentLayouts: {
        [baseFacts.path]: makeDocumentLayout("custom"),
      },
    }));
    expect(resolved.enabled).toBe(true);
    expect(resolved.layoutPreset).toBe("custom");
    expect(resolved.layoutSource.kind).toBe("document");
  });
});

describe("writing mode settings migration", () => {
  it("migrates 0.15.1 CSS layout rules without making them activation rules", () => {
    const migrated = normalizeWritingModeSettings({
      activationClass: "chinese-novel",
      cssClassLayoutRules: [
        { id: "scene", cssClass: ".scene-romance", layoutPreset: "obsidian" },
        { id: "chapter", cssClass: "chapter", layoutPreset: "default" },
      ],
      documentWritingModes: {
        "小说/保留.md": "force-off",
        "小说/无效.md": "invalid",
      },
    }, []);

    expect(migrated.changed).toBe(true);
    expect(migrated.settingsSchemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(migrated.documentWritingModes).toEqual({
      "小说/保留.md": "force-off",
    });
    expect(migrated.autoApplyRules).toEqual([
      {
        id: "scene",
        kind: "css-class",
        cssClass: "scene-romance",
        layoutPreset: "obsidian",
        activateWritingMode: false,
      },
      {
        id: "chapter",
        kind: "css-class",
        cssClass: "chapter",
        layoutPreset: "default",
        activateWritingMode: false,
      },
    ]);
  });

  it("normalizes current settings without duplicating migrated rules", () => {
    const currentRule = makeRule({
      id: "new-css",
      kind: "css-class",
      cssClass: ".scene-romance",
      activateWritingMode: true,
    });
    const normalized = normalizeWritingModeSettings({
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      defaultWritingModeEnabled: true,
      autoTypewriterOnWritingMode: true,
      autoApplyRules: [currentRule],
      cssClassLayoutRules: [
        { id: "legacy", cssClass: "scene-romance", layoutPreset: "obsidian" },
      ],
    }, []);

    expect(normalized.changed).toBe(false);
    expect(normalized.defaultWritingModeEnabled).toBe(true);
    expect(normalized.autoTypewriterOnWritingMode).toBe(true);
    expect(normalized.autoApplyRules).toHaveLength(1);
    expect(normalized.autoApplyRules[0]).toMatchObject({
      id: "new-css",
      cssClass: "scene-romance",
      activateWritingMode: true,
    });
  });

  it("preserves literal leading and trailing spaces in filename patterns", () => {
    const normalized = normalizeWritingModeSettings({
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      autoApplyRules: [{
        id: "spaced-name",
        kind: "filename",
        pattern: " Chapter * ",
        layoutPreset: "default",
        activateWritingMode: true,
      }],
    }, []);

    expect(normalized.autoApplyRules[0]).toMatchObject({
      kind: "filename",
      pattern: " Chapter * ",
    });
  });

  it("treats a fresh installation as current without a migration write", () => {
    const fresh = normalizeWritingModeSettings(null, []);
    expect(fresh.changed).toBe(false);
    expect(fresh.settingsSchemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(fresh.defaultWritingModeEnabled).toBe(false);
    expect(fresh.autoApplyRules).toEqual([]);
    expect(fresh.documentWritingModes).toEqual({});
    expect(fresh.autoTypewriterOnWritingMode).toBe(false);
  });

  it("distinguishes an incomplete folder rule from an explicit vault-root rule", () => {
    const normalized = normalizeWritingModeSettings({
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      autoApplyRules: [
        {
          id: "incomplete",
          kind: "folder",
          folderPath: "",
          includeSubfolders: true,
          layoutPreset: "default",
          activateWritingMode: true,
        },
        {
          id: "vault-root",
          kind: "folder",
          folderPath: "/",
          includeSubfolders: true,
          layoutPreset: "default",
          activateWritingMode: true,
        },
      ],
    }, []);

    expect(normalized.autoApplyRules).toHaveLength(1);
    expect(normalized.autoApplyRules[0]).toMatchObject({
      kind: "folder",
      folderPath: "/",
      includeSubfolders: true,
    });
  });
});
