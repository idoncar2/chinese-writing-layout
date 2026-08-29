import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type FontSelection,
  type UserFont,
} from "./types";
import {
  isObsidianFontPlaceholder,
  OBSIDIAN_NATIVE_FONT_FAMILY,
} from "./obsidian-baseline";
import { extractFontFamilyNames, fontNameToCssFamily } from "./system-fonts";

export type FontRole = "body" | "heading" | "quote" | "bold" | "italic";

export interface FontRoleSelections {
  bodyFont: FontSelection;
  headingFont: FontSelection;
  quoteFont: FontSelection;
  boldFont: FontSelection;
  italicFont: FontSelection;
}

export interface LegacyFontFamilyValues {
  bodyFont?: unknown;
  headingFont?: unknown;
  quoteFont?: unknown;
  boldFont?: unknown;
  italicFont?: unknown;
  fontFamily?: unknown;
  headingFontFamily?: unknown;
  quoteFontFamily?: unknown;
  boldFontFamily?: unknown;
  italicFontFamily?: unknown;
  specialFontFamily?: unknown;
}

export interface NormalizeFontSelectionsOptions {
  /** Layout snapshots historically treated a missing heading as inheriting the body font. */
  missingHeading?: "default" | "body";
}

export interface NormalizedFontSettings extends FontRoleSelections {
  userFonts: UserFont[];
  settingsSchemaVersion: number;
  changed: boolean;
}

const FONT_ROLES: readonly FontRole[] = ["body", "heading", "quote", "bold", "italic"];
const USER_FONT_FORMATS = new Set<UserFont["format"]>(["ttf", "otf", "woff", "woff2"]);

function cloneFontSelection(selection: FontSelection): FontSelection {
  return { ...selection };
}

function getObsidianSelection(role: FontRole): FontSelection {
  return { source: "obsidian", id: role === "heading" ? "heading" : "text" };
}

function getDefaultSelection(role: FontRole): FontSelection {
  const key = `${role}Font` as keyof FontRoleSelections;
  return cloneFontSelection(DEFAULT_SETTINGS[key]);
}

function getRoleLegacyKey(role: FontRole): keyof LegacyFontFamilyValues {
  return `${role}FontFamily` as keyof LegacyFontFamilyValues;
}

function isFontSource(value: unknown): value is "obsidian" | "builtin" | "user" | "system" {
  return value === "obsidian"
    || value === "builtin"
    || value === "user"
    || value === "system";
}

export function isFontSelection(value: unknown): value is FontSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { source?: unknown; id?: unknown };
  if (candidate.source === "inherit") return candidate.id === "body";
  return isFontSource(candidate.source)
    && typeof candidate.id === "string"
    && candidate.id.trim().length > 0;
}

function isObsidianFontFamily(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === OBSIDIAN_NATIVE_FONT_FAMILY
    || normalized === "inherit"
    || /var\(\s*--font-[^)]+\)/u.test(normalized)
    || isObsidianFontPlaceholder(value);
}

function isSpecialRole(role: FontRole): boolean {
  return role === "quote" || role === "bold" || role === "italic";
}

export function normalizeFontSelection(
  value: unknown,
  role: FontRole,
  fallback: FontSelection = getDefaultSelection(role),
): FontSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneFontSelection(fallback);
  }
  const candidate = value as { source?: unknown; id?: unknown };
  if (candidate.source === "inherit" && candidate.id === "body" && isSpecialRole(role)) {
    return { source: "inherit", id: "body" };
  }
  if (!isFontSource(candidate.source)) return cloneFontSelection(fallback);
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) return cloneFontSelection(fallback);
  return { source: candidate.source, id };
}

export function migrateLegacyFontFamily(
  value: unknown,
  role: FontRole,
): FontSelection {
  if (typeof value !== "string" || !value.trim()) return getDefaultSelection(role);
  const trimmed = value.trim();
  if (isObsidianFontFamily(trimmed)) return getObsidianSelection(role);
  const firstName = extractFontFamilyNames(trimmed)[0]?.trim();
  return firstName
    ? { source: "system", id: firstName }
    : getObsidianSelection(role);
}

export function normalizeFontSelections(
  values: LegacyFontFamilyValues | null | undefined,
  options: NormalizeFontSelectionsOptions = {},
): FontRoleSelections {
  const raw = values ?? {};
  const bodyLegacy = migrateLegacyFontFamily(raw.fontFamily, "body");
  const bodyFont = normalizeFontSelection(raw.bodyFont, "body", bodyLegacy);

  const hasLegacyHeading = typeof raw.headingFontFamily === "string"
    && raw.headingFontFamily.trim().length > 0;
  const headingLegacy = hasLegacyHeading
    ? migrateLegacyFontFamily(raw.headingFontFamily ?? raw.fontFamily, "heading")
    : options.missingHeading === "body"
      ? cloneFontSelection(bodyFont)
      : getDefaultSelection("heading");
  const headingFont = normalizeFontSelection(raw.headingFont, "heading", headingLegacy);

  const specialRoles = ["quote", "bold", "italic"] as const;
  const special = Object.fromEntries(specialRoles.map((role) => {
    const roleLegacyValue = raw[getRoleLegacyKey(role)];
    const legacyValue = hasNonEmptyString(roleLegacyValue)
      ? roleLegacyValue
      : raw.specialFontFamily;
    const hasLegacyValue = hasNonEmptyString(legacyValue);
    const fallback = hasLegacyValue
      ? migrateLegacyFontFamily(legacyValue, role)
      : cloneFontSelection(bodyFont);
    const selection = normalizeFontSelection(raw[`${role}Font`], role, fallback);
    return [`${role}Font`, selection];
  })) as Pick<FontRoleSelections, "quoteFont" | "boldFont" | "italicFont">;

  for (const role of specialRoles) {
    const rawSelection = raw[`${role}Font`];
    const hasLegacyValue = hasNonEmptyString(raw[getRoleLegacyKey(role)])
      || hasNonEmptyString(raw.specialFontFamily);
    if (rawSelection === undefined && !hasLegacyValue) {
      special[`${role}Font`] = { source: "inherit", id: "body" };
    }
  }

  return { bodyFont, headingFont, ...special };
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeUserFontFormat(value: unknown): UserFont["format"] | undefined {
  if (typeof value !== "string") return undefined;
  const format = value.trim().toLowerCase().replace(/^\./u, "") as UserFont["format"];
  return USER_FONT_FORMATS.has(format) ? format : undefined;
}

function normalizeUserFontFileName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const fileName = value.trim();
  if (!fileName || fileName === "." || fileName === ".." || /[\\/]/u.test(fileName)) return undefined;
  return fileName;
}

export function normalizeUserFonts(value: unknown): UserFont[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const raw = candidate as Partial<UserFont>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const fileName = normalizeUserFontFileName(raw.fileName);
    const originalFileName = normalizeUserFontFileName(raw.originalFileName);
    const format = normalizeUserFontFormat(raw.format);
    if (!id || !name || !fileName || !originalFileName || !format || ids.has(id)) return [];
    ids.add(id);
    return [{ id, name, fileName, originalFileName, format }];
  });
}

export function normalizeFontSettings(stored: unknown): NormalizedFontSettings {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {
      ...normalizeFontSelections(undefined),
      userFonts: [],
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      changed: false,
    };
  }

  const raw = stored as Record<string, unknown>;
  const selections = normalizeFontSelections(raw);
  const userFonts = normalizeUserFonts(raw.userFonts);
  const storedSchemaVersion = typeof raw.settingsSchemaVersion === "number"
    && Number.isFinite(raw.settingsSchemaVersion)
    ? raw.settingsSchemaVersion
    : 0;
  const hasAllSelections = FONT_ROLES.every((role) => {
    const selection = raw[`${role}Font`];
    return isFontSelection(selection)
      && (isSpecialRole(role) || selection.source !== "inherit");
  });
  const hasUserFonts = Array.isArray(raw.userFonts);
  const rawUserFonts = hasUserFonts ? raw.userFonts : [];
  const changed = storedSchemaVersion < CURRENT_SETTINGS_SCHEMA_VERSION
    || !hasAllSelections
    || !hasUserFonts
    || JSON.stringify(rawUserFonts) !== JSON.stringify(userFonts);
  return {
    ...selections,
    userFonts,
    settingsSchemaVersion: Math.max(CURRENT_SETTINGS_SCHEMA_VERSION, storedSchemaVersion),
    changed,
  };
}

export function repairFontSelectionsAfterUserFontDeletion(
  selections: FontRoleSelections,
  deletedId: string,
): FontRoleSelections {
  const normalizedId = deletedId.trim();
  return {
    bodyFont: selections.bodyFont.source === "user" && selections.bodyFont.id === normalizedId
      ? getObsidianSelection("body")
      : cloneFontSelection(selections.bodyFont),
    headingFont: selections.headingFont.source === "user" && selections.headingFont.id === normalizedId
      ? getObsidianSelection("heading")
      : cloneFontSelection(selections.headingFont),
    quoteFont: selections.quoteFont.source === "user" && selections.quoteFont.id === normalizedId
      ? { source: "inherit", id: "body" }
      : cloneFontSelection(selections.quoteFont),
    boldFont: selections.boldFont.source === "user" && selections.boldFont.id === normalizedId
      ? { source: "inherit", id: "body" }
      : cloneFontSelection(selections.boldFont),
    italicFont: selections.italicFont.source === "user" && selections.italicFont.id === normalizedId
      ? { source: "inherit", id: "body" }
      : cloneFontSelection(selections.italicFont),
  };
}

export function countUserFontReferences(
  selections: Partial<FontRoleSelections> | null | undefined,
  userFontId: string,
): number {
  const normalizedId = userFontId.trim();
  if (!normalizedId || !selections) return 0;
  return FONT_ROLES.reduce((count, role) => {
    const selection = selections[`${role}Font` as keyof FontRoleSelections];
    return count + (
      selection?.source === "user" && selection.id === normalizedId
        ? 1
        : 0
    );
  }, 0);
}

export function fontSelectionToLegacyFontFamily(
  selection: FontSelection,
  role: FontRole,
): string {
  if (selection.source === "inherit") return "inherit";
  if (selection.source === "obsidian") return OBSIDIAN_NATIVE_FONT_FAMILY;
  return `${fontNameToCssFamily(selection.id)}, ${role === "heading" ? "sans-serif" : "serif"}`;
}
