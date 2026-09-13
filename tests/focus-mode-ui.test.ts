import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("focus mode UI", () => {
  it("has no exit button and exits only through Escape", () => {
    const focusMethod = mainSource.slice(
      mainSource.indexOf("toggleFocusMode(enabled"),
      mainSource.indexOf("private captureFocusContentWidth"),
    );

    expect(focusMethod).not.toContain("cw-focus-exit");
    expect(focusMethod).not.toContain("createEl(\"button\"");
    expect(mainSource).toContain('event.key === "Escape" && this.focusModeEnabled');
    expect(styles).not.toContain(".cw-focus-exit");
  });
});
