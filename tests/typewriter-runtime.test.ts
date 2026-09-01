import { describe, expect, it } from "vitest";
import {
  getEffectiveTypewriterMode,
  planTypewriterToggle,
  normalizeTypewriterScopeSetting,
  resolveManualTypewriterMode,
  updateManualTypewriterState,
} from "../src/typewriter-runtime";

describe("manual typewriter scope", () => {
  it("migrates the legacy manual setting into the new workbench scope", () => {
    expect(normalizeTypewriterScopeSetting({ typewriterMode: true })).toBe(true);
    expect(normalizeTypewriterScopeSetting({ typewriterMode: false })).toBe(false);
    expect(normalizeTypewriterScopeSetting({
      typewriterMode: true,
      typewriterModeAppliesToAllDocuments: false,
    })).toBe(false);
  });
  it("uses the current document state when global scope is disabled", () => {
    expect(resolveManualTypewriterMode({
      appliesToAllDocuments: false,
      globalEnabled: true,
      documentEnabled: false,
    })).toBe(false);
  });

  it("uses the shared state when global scope is enabled", () => {
    expect(resolveManualTypewriterMode({
      appliesToAllDocuments: true,
      globalEnabled: true,
      documentEnabled: false,
    })).toBe(true);
  });

  it("updates only the current document in document scope", () => {
    expect(updateManualTypewriterState({
      appliesToAllDocuments: false,
      globalEnabled: true,
      documentEnabled: false,
    }, true)).toEqual({ globalEnabled: true, documentEnabled: true });
  });

  it("updates only the shared state in global scope", () => {
    expect(updateManualTypewriterState({
      appliesToAllDocuments: true,
      globalEnabled: false,
      documentEnabled: true,
    }, true)).toEqual({ globalEnabled: true, documentEnabled: true });
  });
});

describe("automatic typewriter runtime behavior", () => {
  it("adds an automatic runtime layer without changing the manual setting", () => {
    expect(getEffectiveTypewriterMode({
      manualEnabled: false,
      autoEnabled: true,
      writingModeEnabled: true,
      autoSuppressed: false,
    })).toBe(true);
    expect(getEffectiveTypewriterMode({
      manualEnabled: false,
      autoEnabled: true,
      writingModeEnabled: false,
      autoSuppressed: false,
    })).toBe(false);
  });

  it("lets the user suppress an automatic session without persisting false", () => {
    expect(planTypewriterToggle({
      manualEnabled: false,
      autoEnabled: true,
      writingModeEnabled: true,
      autoSuppressed: false,
    })).toEqual({ manualEnabled: false, autoSuppressed: true });
  });

  it("restores automatic behavior when toggled again", () => {
    expect(planTypewriterToggle({
      manualEnabled: false,
      autoEnabled: true,
      writingModeEnabled: true,
      autoSuppressed: true,
    })).toEqual({ manualEnabled: false, autoSuppressed: false });
  });

  it("keeps the original persistent toggle when automatic behavior is inactive", () => {
    expect(planTypewriterToggle({
      manualEnabled: false,
      autoEnabled: false,
      writingModeEnabled: true,
      autoSuppressed: false,
    })).toEqual({ manualEnabled: true, autoSuppressed: false });
    expect(planTypewriterToggle({
      manualEnabled: true,
      autoEnabled: true,
      writingModeEnabled: false,
      autoSuppressed: false,
    })).toEqual({ manualEnabled: false, autoSuppressed: false });
  });

  it("turns off both the manual layer and current automatic session in one click", () => {
    expect(planTypewriterToggle({
      manualEnabled: true,
      autoEnabled: true,
      writingModeEnabled: true,
      autoSuppressed: false,
    })).toEqual({ manualEnabled: false, autoSuppressed: true });
  });
});
