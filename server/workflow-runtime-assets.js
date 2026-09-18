import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.join(
  here,
  "..",
  "data",
  "workflow-assets",
  "blobs",
);
const blobIdPattern = /^[a-f0-9]{64}$/;

const assetList = (value) => (Array.isArray(value) ? value : []);

function decodeAssetData(value) {
  if (Buffer.isBuffer(value)) return value;
  const input = String(value || "").trim();
  const comma = input.indexOf(",");
  const payload = /^data:[^;,]+;base64,/i.test(input)
    ? input.slice(comma + 1)
    : input;
  return Buffer.from(payload.replace(/\s+/g, ""), "base64");
}

function safeAssetMetadata(asset, blobId, size) {
  const type = ["image", "video", "audio"].includes(asset?.type)
    ? asset.type
    : String(asset?.mimeType || "application/octet-stream").split("/")[0];
  return {
    type,
    name: String(asset?.name || "项目素材").slice(0, 180),
    mimeType: String(asset?.mimeType || "application/octet-stream").slice(
      0,
      120,
    ),
    size,
    blobId,
    ...(asset?.source === "hot-rank" ? { source: "hot-rank" } : {}),
  };
}

export function mergeWorkflowRuntimeAssets(source = {}, submitted = {}) {
  const result = {};
  const nodeIds = new Set([
    ...Object.keys(source || {}),
    ...Object.keys(submitted || {}),
  ]);
  for (const nodeId of nodeIds) {
    const replacement = assetList(submitted?.[nodeId]);
    const inherited = assetList(source?.[nodeId]);
    const selected = replacement.length ? replacement : inherited;
    if (selected.length) result[nodeId] = selected;
  }
  return result;
}

export async function persistWorkflowRuntimeAssets(
  runtimeAssets = {},
  { rootDir = defaultRootDir } = {},
) {
  await fs.mkdir(rootDir, { recursive: true });
  const manifest = {};
  for (const [nodeId, assets] of Object.entries(runtimeAssets || {})) {
    const stored = [];
    for (const asset of assetList(assets)) {
      if (blobIdPattern.test(String(asset?.blobId || ""))) {
        const filePath = path.join(rootDir, asset.blobId);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat?.isFile()) continue;
        stored.push(safeAssetMetadata(asset, asset.blobId, stat.size));
        continue;
      }
      if (!asset?.data) continue;
      const buffer = decodeAssetData(asset.data);
      if (!buffer.length) continue;
      const blobId = createHash("sha256").update(buffer).digest("hex");
      const filePath = path.join(rootDir, blobId);
      try {
        await fs.writeFile(filePath, buffer, { flag: "wx" });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      stored.push(safeAssetMetadata(asset, blobId, buffer.length));
    }
    if (stored.length) manifest[nodeId] = stored;
  }
  return manifest;
}

export async function persistWorkflowRuntimeAsset(
  asset,
  { rootDir = defaultRootDir } = {},
) {
  const manifest = await persistWorkflowRuntimeAssets(
    { upload: [asset] },
    { rootDir },
  );
  return manifest.upload?.[0] || null;
}

export async function persistWorkflowRuntimeAssetFile(
  filePath,
  asset,
  { rootDir = defaultRootDir } = {},
) {
  await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
  const handle = await fs.open(filePath, "r");
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let size = 0;
  try {
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      hash.update(chunk.subarray(0, bytesRead));
      size += bytesRead;
    }
  } finally {
    await handle.close();
  }
  if (!size) return null;
  const blobId = hash.digest("hex");
  const storedPath = path.join(rootDir, blobId);
  try {
    await fs.copyFile(filePath, storedPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await fs.chmod(storedPath, 0o600);
  return safeAssetMetadata(asset, blobId, size);
}

export async function loadWorkflowRuntimeAssets(
  manifest = {},
  { rootDir = defaultRootDir } = {},
) {
  const runtimeAssets = {};
  for (const [nodeId, assets] of Object.entries(manifest || {})) {
    const restored = [];
    for (const asset of assetList(assets)) {
      if (!blobIdPattern.test(String(asset?.blobId || ""))) continue;
      const buffer = await fs.readFile(path.join(rootDir, asset.blobId));
      restored.push({ ...asset, data: buffer.toString("base64") });
    }
    if (restored.length) runtimeAssets[nodeId] = restored;
  }
  return runtimeAssets;
}

export async function materializeWorkflowRuntimeAssets(
  input = {},
  options = {},
) {
  if (input?.runtimeAssetManifest)
    return loadWorkflowRuntimeAssets(input.runtimeAssetManifest, options);
  return input?.runtimeAssets || {};
}

export function publicWorkflowRuntimeAssets(runId, manifest = {}) {
  return Object.fromEntries(
    Object.entries(manifest || {}).map(([nodeId, assets]) => [
      nodeId,
      assetList(assets).map((asset, index) => {
        const { blobId: _blobId, ...metadata } = asset || {};
        return {
          ...metadata,
          url: `/api/workflow-runs/${encodeURIComponent(runId)}/assets/${encodeURIComponent(nodeId)}/${index}`,
        };
      }),
    ]),
  );
}

export async function workflowRuntimeAssetBuffer(
  manifest,
  nodeId,
  index,
  { rootDir = defaultRootDir } = {},
) {
  const asset = assetList(manifest?.[nodeId])[Number(index)];
  if (!asset || !blobIdPattern.test(String(asset.blobId || ""))) return null;
  return fs.readFile(path.join(rootDir, asset.blobId));
}

