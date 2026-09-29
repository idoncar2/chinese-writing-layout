import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "chinese-writing-layout";
const INSTALL_FILES = ["main.js", "manifest.json", "styles.css"];

function getArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`无法读取${label}：${path}`, { cause: error });
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readTargetManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw new Error(`无法读取目标 manifest.json：${path}`, { cause: error });
  }
}

export async function deployPlugin({ root, configPath }) {
  const sourceRoot = resolve(root);
  const config = await readJson(resolve(configPath), "本机部署配置");
  if (typeof config.pluginDir !== "string" || !config.pluginDir.trim()) {
    throw new Error("本机部署配置必须包含非空的 pluginDir。 ");
  }

  const pluginDir = resolve(config.pluginDir);
  if (pluginDir === sourceRoot) {
    throw new Error("插件部署目录不能与项目根目录相同。 ");
  }

  const sourceManifest = await readJson(resolve(sourceRoot, "manifest.json"), "源 manifest.json");
  if (sourceManifest.id !== PLUGIN_ID) {
    throw new Error(`源 manifest.json 的插件 ID 必须是 ${PLUGIN_ID}。`);
  }

  const targetManifest = await readTargetManifest(resolve(pluginDir, "manifest.json"));
  if (targetManifest && targetManifest.id !== PLUGIN_ID) {
    throw new Error(`目标目录属于其他插件：${targetManifest.id ?? "未知插件"}`);
  }

  await mkdir(pluginDir, { recursive: true });
  for (const fileName of INSTALL_FILES) {
    const source = resolve(sourceRoot, fileName);
    const target = resolve(pluginDir, fileName);
    await copyFile(source, target);
    if (await sha256(source) !== await sha256(target)) {
      throw new Error(`部署校验失败：${fileName}`);
    }
  }

  return { pluginDir, files: [...INSTALL_FILES], version: sourceManifest.version };
}

async function main() {
  const root = resolve(getArgument("--root", process.cwd()));
  const configPath = resolve(getArgument("--config", resolve(root, ".deploy.local.json")));
  const result = await deployPlugin({ root, configPath });
  console.log(`已部署 ${PLUGIN_ID} ${result.version} 到 ${result.pluginDir}`);
  console.log(`已校验：${result.files.join("、")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
