import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.join(
  here,
  "..",
  "data",
  "digital-assets",
  "blobs",
);
const blobIdPattern = /^[a-f0-9]{64}$/;
const securedBlobRoots = new Set();

const imageList = (value) => (Array.isArray(value) ? value : []);

function imageMetadata(image, blobId, size) {
  return {
    name: String(image?.name || "reference.png").slice(0, 180),
    mimeType: String(image?.mimeType || "image/png").slice(0, 120),
    size,
    blobId,
  };
}

async function ensurePrivateBlobRoot(rootDir) {
  await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
  await fs.chmod(rootDir, 0o700);
  const resolvedRoot = path.resolve(rootDir);
  if (securedBlobRoots.has(resolvedRoot)) return;
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => fs.chmod(path.join(rootDir, entry.name), 0o600)),
  );
  securedBlobRoots.add(resolvedRoot);
}

export async function persistDigitalAssetImages(
  images = [],
  { rootDir = defaultRootDir } = {},
) {
  await ensurePrivateBlobRoot(rootDir);
  const stored = [];
  for (const image of imageList(images)) {
    if (blobIdPattern.test(String(image?.blobId || ""))) {
      await fs.chmod(path.join(rootDir, image.blobId), 0o600).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      stored.push(imageMetadata(image, image.blobId, Number(image.size || 0)));
      continue;
    }
    const buffer = Buffer.from(String(image?.data || ""), "base64");
    if (!buffer.length) continue;
    const blobId = createHash("sha256").update(buffer).digest("hex");
    const blobPath = path.join(rootDir, blobId);
    try {
      await fs.writeFile(blobPath, buffer, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    await fs.chmod(blobPath, 0o600);
    stored.push(imageMetadata(image, blobId, buffer.length));
  }
  return stored;
}

export async function digitalAssetImageBuffer(
  image,
  { rootDir = defaultRootDir } = {},
) {
  if (blobIdPattern.test(String(image?.blobId || ""))) {
    await ensurePrivateBlobRoot(rootDir);
    const blobPath = path.join(rootDir, image.blobId);
    await fs.chmod(blobPath, 0o600);
    return fs.readFile(blobPath);
  }
  const buffer = Buffer.from(String(image?.data || ""), "base64");
  return buffer.length ? buffer : null;
}

export async function migrateDigitalAssetRecords(
  assets = [],
  { rootDir = defaultRootDir } = {},
) {
  let changed = false;
  const migrated = [];
  for (const asset of Array.isArray(assets) ? assets : []) {
    const originalImages = imageList(asset?.images);
    if (!originalImages.some((image) => image?.data)) {
      migrated.push(asset);
      continue;
    }
    const images = await persistDigitalAssetImages(originalImages, { rootDir });
    migrated.push({ ...asset, images });
    changed = true;
  }
  return { assets: migrated, changed };
}

