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
