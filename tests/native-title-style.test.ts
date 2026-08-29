import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Obsidian native article title", () => {
  it("keeps the inline note title aligned with the selected heading font", () => {
    const styles = readFileSync(resolve("styles.css"), "utf8");
    expect(styles).toContain("--inline-title-font: var(--cw-heading-font-family);");
    expect(styles).toContain(
      ".workspace-leaf-content.cw-novel-enabled:not(.cw-follow-obsidian) .inline-title",
    );
    expect(styles).toContain(
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian.cw-follow-override-heading-font-family .inline-title",
    );
    expect(styles).not.toContain(
      ".workspace-leaf-content.cw-novel-enabled.cw-follow-obsidian .inline-title {",
    );
  });
});
