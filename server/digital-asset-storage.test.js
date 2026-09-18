import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  digitalAssetImageBuffer,
  migrateDigitalAssetRecords,
  persistDigitalAssetImages,
} from "./digital-asset-storage.js";

test("stores digital asset image payloads as content-addressed blobs", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-assets-"));
  await fs.chmod(rootDir, 0o755);
  const source = Buffer.from("digital-asset-image");
  try {
    const stored = await persistDigitalAssetImages(
      [{ data: source.toString("base64"), name: "face.png", mimeType: "image/png" }],
      { rootDir },
    );
    assert.equal(stored.length, 1);
    assert.equal(stored[0].data, undefined);
    assert.equal(stored[0].size, source.length);
    assert.match(stored[0].blobId, /^[a-f0-9]{64}$/);
    const blobPath = path.join(rootDir, stored[0].blobId);
    assert.equal((await fs.stat(rootDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(blobPath)).mode & 0o777, 0o600);
    await fs.chmod(blobPath, 0o644);
    assert.deepEqual(await digitalAssetImageBuffer(stored[0], { rootDir }), source);
    assert.equal((await fs.stat(blobPath)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("migrates legacy inline images without changing asset metadata", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-migrate-"));
  try {
    const result = await migrateDigitalAssetRecords(
      [
        {
          id: "asset-1",
          name: "服装",
          images: [
            {
              data: Buffer.from("garment").toString("base64"),
              name: "garment.jpg",
              mimeType: "image/jpeg",
            },
          ],
        },
      ],
      { rootDir },
    );
    assert.equal(result.changed, true);
    assert.equal(result.assets[0].id, "asset-1");
    assert.equal(result.assets[0].images[0].data, undefined);
    assert.deepEqual(
      await digitalAssetImageBuffer(result.assets[0].images[0], { rootDir }),
      Buffer.from("garment"),
    );
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

