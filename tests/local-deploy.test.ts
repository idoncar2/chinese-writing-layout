import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const deployScript = resolve("scripts/deploy-local.mjs");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local plugin deployment", () => {
  it("copies only Obsidian installation files and preserves plugin data", () => {
    const root = mkdtempSync(join(tmpdir(), "cw-deploy-source-"));
    const pluginDir = mkdtempSync(join(tmpdir(), "cw-deploy-target-"));
    temporaryDirectories.push(root, pluginDir);
    writeFileSync(join(root, "main.js"), "main-build");
    writeFileSync(join(root, "styles.css"), "styles-build");
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      id: "chinese-writing-layout",
      version: "1.2.3",
    }));
    writeFileSync(join(root, "package.json"), "must-not-deploy");
    writeFileSync(join(pluginDir, "data.json"), "user-settings");
    const configPath = join(root, ".deploy.local.json");
    writeFileSync(configPath, JSON.stringify({ pluginDir }));

    execFileSync(process.execPath, [deployScript, "--root", root, "--config", configPath], {
      stdio: "pipe",
    });

    expect(readFileSync(join(pluginDir, "main.js"), "utf8")).toBe("main-build");
    expect(readFileSync(join(pluginDir, "styles.css"), "utf8")).toBe("styles-build");
    expect(JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"))).toMatchObject({
      id: "chinese-writing-layout",
      version: "1.2.3",
    });
    expect(readFileSync(join(pluginDir, "data.json"), "utf8")).toBe("user-settings");
    expect(() => readFileSync(join(pluginDir, "package.json"), "utf8")).toThrow();
  });

  it("refuses to overwrite a directory belonging to another plugin", () => {
    const root = mkdtempSync(join(tmpdir(), "cw-deploy-source-"));
    const pluginDir = mkdtempSync(join(tmpdir(), "cw-deploy-target-"));
    temporaryDirectories.push(root, pluginDir);
    writeFileSync(join(root, "main.js"), "new-main");
    writeFileSync(join(root, "styles.css"), "new-styles");
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      id: "chinese-writing-layout",
      version: "1.2.3",
    }));
    writeFileSync(join(pluginDir, "main.js"), "other-plugin-main");
    writeFileSync(join(pluginDir, "manifest.json"), JSON.stringify({ id: "another-plugin" }));
    const configPath = join(root, ".deploy.local.json");
    writeFileSync(configPath, JSON.stringify({ pluginDir }));

    expect(() => execFileSync(
      process.execPath,
      [deployScript, "--root", root, "--config", configPath],
      { stdio: "pipe" },
    )).toThrow();
    expect(readFileSync(join(pluginDir, "main.js"), "utf8")).toBe("other-plugin-main");
  });
});
