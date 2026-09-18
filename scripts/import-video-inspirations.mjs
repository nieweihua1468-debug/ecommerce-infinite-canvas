if (!process.argv[2]) throw new Error("请传入要导入的本地素材目录；公开版不附带私人素材。");
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeInspirationGenerationConfig } from "../server/inspiration-generation-config.js";
import { isTemplateLibraryVideoTemplate } from "../server/inspiration-import-policy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const sourceRoot = path.resolve(
  process.argv[2] ||
    "",
);
const sourceDataPath = path.join(sourceRoot, "data", "uploaded.json");
const sourceConfigPath = path.join(
  sourceRoot,
  "data",
  "video-generation-config.json",
);
const targetAssetDir = path.join(
  projectRoot,
  "data",
  "inspiration-assets",
  "library",
);
const targetManifestPath = path.join(
  projectRoot,
  "data",
  "inspirations.json",
);
const targetSettingsPath = path.join(
  projectRoot,
  "data",
  "system_settings.json",
);

const readJson = async (file, fallback) =>
  fs
    .readFile(file, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return fallback;
      throw error;
    });

const safeName = (value) =>
  String(value || "template")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "template";

const sourcePathForUrl = (url) =>
  path.join(
    sourceRoot,
    decodeURIComponent(String(url || "")).replace(/^\/+/, ""),
  );

async function linkAsset(item, slot, url) {
  if (!url) return "";
  const sourcePath = sourcePathForUrl(url);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) return "";
  const extension = path.extname(sourcePath).toLowerCase() || ".bin";
  const fileName = `${safeName(item.id)}-${slot}${extension}`;
  const targetPath = path.join(targetAssetDir, fileName);
  await fs.rm(targetPath, { force: true });
  try {
    await fs.link(sourcePath, targetPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fs.copyFile(sourcePath, targetPath);
  }
  return `/inspiration-assets/library/${encodeURIComponent(fileName)}`;
}

async function importItem(item, index) {
  const coverUrl = await linkAsset(
    item,
    "cover",
    item.coverUrl || item.mainImageUrl,
  );
  if (!coverUrl) return null;
  const [videoUrl, audioUrl] = await Promise.all([
    linkAsset(item, "video", item.videoUrl),
    linkAsset(item, "audio", item.audioUrl),
  ]);
  const now = new Date().toISOString();
  return {
    id: `library-${item.id}`,
    title: item.title || item.id,
    kind: "video",
    category: item.category || "视频模版",
    ratio: item.ratio === "待标注" ? "9:16" : item.ratio || "9:16",
    duration: item.duration || "15s",
    description: item.description || "上传换装图片，一键生成同款视频。",
    tags: [
      ...new Set([
        ...(Array.isArray(item.tags) ? item.tags : []),
        "视频模版",
        "一键同款",
        "单节点视频生成",
      ]),
    ].slice(0, 12),
    promptText: item.videoPrompt || item.promptText || "",
    videoPrompt: item.videoPrompt || item.promptText || "",
    negativePrompt: item.negativePrompt || "",
    coverUrl,
    mainImageUrl: coverUrl,
    videoUrl,
    audioUrl,
    mediaType: "video",
    workflowPreset: "single-node-outfit-video",
    workflowName: "上传换装图 → 单节点视频生成",
    custom: false,
    imported: true,
    importedFrom: "AI模版库-完整无视频版-20260729",
    source: item.source || {},
    createdAt: item.uploadedAt || now,
    updatedAt: item.updatedAt || now,
    sortOrder: Number.isFinite(Number(item.sortOrder))
      ? Number(item.sortOrder)
      : index,
  };
}

async function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
}

async function removeUnusedImportedAssets(items) {
  const usedNames = new Set(
    items.flatMap((item) =>
      [item.coverUrl, item.videoUrl, item.audioUrl]
        .filter(Boolean)
        .map((url) => decodeURIComponent(path.basename(url))),
    ),
  );
  const names = await fs.readdir(targetAssetDir).catch(() => []);
  const unused = names.filter((name) => !usedNames.has(name));
  await Promise.all(
    unused.map((name) => fs.rm(path.join(targetAssetDir, name), { force: true })),
  );
  return unused.length;
}

async function main() {
  const sourceItems = await readJson(sourceDataPath, []);
  const candidates = sourceItems.filter(isTemplateLibraryVideoTemplate);
  await fs.mkdir(targetAssetDir, { recursive: true });
  const imported = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = await importItem(candidates[index], index);
    if (item) imported.push(item);
  }

  const currentManifest = await readJson(targetManifestPath, {});
  const retainedItems = (Array.isArray(currentManifest.items)
    ? currentManifest.items
    : []
  ).filter((item) => item.importedFrom !== "AI模版库-完整无视频版-20260729");
  const now = new Date().toISOString();
  await writeJsonAtomic(targetManifestPath, {
    ...currentManifest,
    version: Math.max(1, Number(currentManifest.version) || 0) + 1,
    updatedAt: now,
    prompts: currentManifest.prompts || {},
    items: [...imported, ...retainedItems],
  });
  const removedAssetCount = await removeUnusedImportedAssets(imported);

  const [sourceConfig, currentSettings] = await Promise.all([
    readJson(sourceConfigPath, {}),
    readJson(targetSettingsPath, {}),
  ]);
  await writeJsonAtomic(targetSettingsPath, {
    ...currentSettings,
    inspirationGenerationConfig: normalizeInspirationGenerationConfig(
      sourceConfig,
    ),
  });

  const withVideo = imported.filter((item) => item.videoUrl).length;
  process.stdout.write(
    `已导入 ${imported.length} 个模版库案例，其中 ${withVideo} 个带原视频预览；已清理 ${removedAssetCount} 个非模版库资源。\n`,
  );
}

await main();

