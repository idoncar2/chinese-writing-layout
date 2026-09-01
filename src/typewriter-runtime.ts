export interface TypewriterRuntimeState {
  manualEnabled: boolean;
  autoEnabled: boolean;
  writingModeEnabled: boolean;
  autoSuppressed: boolean;
}

export interface TypewriterTogglePlan {
  manualEnabled: boolean;
  autoSuppressed: boolean;
}

export interface ManualTypewriterScopeState {
  appliesToAllDocuments: boolean;
  globalEnabled: boolean;
  documentEnabled: boolean;
}

export function normalizeTypewriterScopeSetting(stored: unknown): boolean {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  const raw = stored as Record<string, unknown>;
  if (typeof raw.typewriterModeAppliesToAllDocuments === "boolean") {
    return raw.typewriterModeAppliesToAllDocuments;
  }
  return raw.typewriterMode === true;
}

export function resolveManualTypewriterMode(
  state: ManualTypewriterScopeState,
): boolean {
  return state.appliesToAllDocuments
    ? state.globalEnabled
    : state.documentEnabled;
}

export function updateManualTypewriterState(
  state: ManualTypewriterScopeState,
  enabled: boolean,
): Pick<ManualTypewriterScopeState, "globalEnabled" | "documentEnabled"> {
  return state.appliesToAllDocuments
    ? { globalEnabled: enabled, documentEnabled: state.documentEnabled }
    : { globalEnabled: state.globalEnabled, documentEnabled: enabled };
}

export function getEffectiveTypewriterMode(state: TypewriterRuntimeState): boolean {
  return state.manualEnabled || (
    state.autoEnabled
    && state.writingModeEnabled
    && !state.autoSuppressed
  );
}

/**
 * A manual click always changes what the user sees. When the automatic layer
 * is responsible for the active state, the click suppresses that layer for
 * the current note session instead of rewriting the saved manual preference.
 */
export function planTypewriterToggle(
  state: TypewriterRuntimeState,
): TypewriterTogglePlan {
  const automaticLayerAvailable = state.autoEnabled && state.writingModeEnabled;
  const effective = getEffectiveTypewriterMode(state);

  if (effective) {
    return {
      manualEnabled: false,
      autoSuppressed: automaticLayerAvailable,
    };
  }

  if (automaticLayerAvailable && state.autoSuppressed) {
    return {
      manualEnabled: state.manualEnabled,
      autoSuppressed: false,
    };
  }

  return {
    manualEnabled: true,
    autoSuppressed: false,
  };
}
