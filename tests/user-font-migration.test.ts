import { describe, expect, it } from "vitest";
import * as userFontModule from "../src/user-fonts";

interface TestAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
}

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function createAdapter(
  initialFiles: Record<string, ArrayBuffer>,
  failRename = false,
  corruptWrites = false,
): TestAdapter {
  const files = new Map(Object.entries(initialFiles));
  const folders = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }

  return {
    async exists(path) {
      return files.has(path) || folders.has(path);
    },
    async mkdir(path) {
      folders.add(path);
    },
    async rename(from, to) {
      if (failRename) throw new Error("rename unavailable");
      const matchingFiles = [...files.entries()].filter(([path]) => path.startsWith(`${from}/`));
      for (const [path, data] of matchingFiles) {
        files.delete(path);
        files.set(`${to}${path.slice(from.length)}`, data);
      }
      folders.delete(from);
      folders.add(to);
    },
    async list(path) {
      return {
        files: [...files.keys()].filter((file) => {
          const suffix = file.slice(path.length + 1);
          return file.startsWith(`${path}/`) && !suffix.includes("/");
        }),
        folders: [...folders].filter((folder) => {
          const suffix = folder.slice(path.length + 1);
          return folder.startsWith(`${path}/`) && !suffix.includes("/");
        }),
      };
    },
    async readBinary(path) {
      const data = files.get(path);
      if (!data) throw new Error(`missing: ${path}`);
      return data;
    },
    async writeBinary(path, data) {
      files.set(path, corruptWrites ? bytes(255) : data);
    },
    async remove(path) {
      files.delete(path);
    },
    async rmdir(path) {
      folders.delete(path);
    },
  };
}

type UserFontMigrationModule = typeof userFontModule & {
  getLegacyUserFontDirectory(
    pluginDirectory: string | undefined,
    configDir: string,
    pluginId: string,
  ): string;
  migrateLegacyUserFontDirectory(
    adapter: TestAdapter,
    legacyDirectory: string,
    currentDirectory: string,
  ): Promise<{ migratedFiles: number; legacyDirectoryRemoved: boolean; failures: string[] }>;
  findUserFontFilePath(
    adapter: Pick<TestAdapter, "exists">,
    currentDirectory: string,
    legacyDirectory: string,
    fileName: string,
  ): Promise<string | undefined>;
};

const migrationModule = userFontModule as UserFontMigrationModule;

describe("user font storage migration", () => {
  it("moves legacy plugin-owned fonts to update-safe storage even when directory rename fails", async () => {
    const legacyDirectory = ".obsidian/plugins/chinese-writing-layout/fonts";
    const currentDirectory = ".obsidian/chinese-writing-layout/fonts";
    const fileName = "cw-user-test.ttf";
    const legacyPath = `${legacyDirectory}/${fileName}`;
    const adapter = createAdapter({ [legacyPath]: bytes(1, 2, 3) }, true);

    expect(migrationModule.getLegacyUserFontDirectory(
      ".obsidian/plugins/chinese-writing-layout",
      ".obsidian",
      "chinese-writing-layout",
    )).toBe(legacyDirectory);

    const result = await migrationModule.migrateLegacyUserFontDirectory(
      adapter,
      legacyDirectory,
      currentDirectory,
    );

    expect(result).toEqual({
      migratedFiles: 1,
      legacyDirectoryRemoved: true,
      failures: [],
    });
    expect(await adapter.exists(legacyDirectory)).toBe(false);
    expect(await adapter.exists(`${currentDirectory}/${fileName}`)).toBe(true);
  });

  it("loads from the legacy path when migration could not complete", async () => {
    const legacyDirectory = ".obsidian/plugins/chinese-writing-layout/fonts";
    const currentDirectory = ".obsidian/chinese-writing-layout/fonts";
    const fileName = "cw-user-test.ttf";
    const adapter = createAdapter({ [`${legacyDirectory}/${fileName}`]: bytes(4, 5, 6) });

    await expect(migrationModule.findUserFontFilePath(
      adapter,
      currentDirectory,
      legacyDirectory,
      fileName,
    )).resolves.toBe(`${legacyDirectory}/${fileName}`);
  });

  it("removes an unverified new copy so the intact legacy font remains loadable", async () => {
    const legacyDirectory = ".obsidian/plugins/chinese-writing-layout/fonts";
    const currentDirectory = ".obsidian/chinese-writing-layout/fonts";
    const fileName = "cw-user-test.ttf";
    const adapter = createAdapter(
      { [`${legacyDirectory}/${fileName}`]: bytes(7, 8, 9) },
      true,
      true,
    );

    const result = await migrationModule.migrateLegacyUserFontDirectory(
      adapter,
      legacyDirectory,
      currentDirectory,
    );

    expect(result.failures).toContain(`${legacyDirectory}/${fileName}`);
    expect(await adapter.exists(`${currentDirectory}/${fileName}`)).toBe(false);
    await expect(migrationModule.findUserFontFilePath(
      adapter,
      currentDirectory,
      legacyDirectory,
      fileName,
    )).resolves.toBe(`${legacyDirectory}/${fileName}`);
  });
});
