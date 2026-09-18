import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadWorkflowRuntimeAssets,
  materializeWorkflowRuntimeAssets,
  mergeWorkflowRuntimeAssets,
  persistWorkflowRuntimeAsset,
  persistWorkflowRuntimeAssetFile,
  persistWorkflowRuntimeAssets,
  publicWorkflowRuntimeAssets,
  workflowRuntimeAssetBuffer,
} from "./workflow-runtime-assets.js";

test("reuses a separately uploaded workflow blob without embedding media again", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-upload-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const uploaded = await persistWorkflowRuntimeAsset(
    {
      type: "image",
      data: Buffer.from("one-image").toString("base64"),
      name: "one.png",
      mimeType: "image/png",
    },
    { rootDir },
  );
  const manifest = await persistWorkflowRuntimeAssets(
    { node1: [uploaded] },
    { rootDir },
  );
  assert.equal(manifest.node1[0].blobId, uploaded.blobId);
  assert.equal(manifest.node1[0].size, Buffer.byteLength("one-image"));
});

test("persists a raw binary upload without a Base64 conversion", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-raw-upload-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const source = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
  const uploaded = await persistWorkflowRuntimeAsset(
    {
      type: "image",
      data: source,
      name: "raw.png",
      mimeType: "image/png",
    },
    { rootDir },
  );
  const stored = await fs.readFile(path.join(rootDir, uploaded.blobId));
  assert.deepEqual(stored, source);
  assert.equal(uploaded.size, source.length);
});

test("imports an existing server media file into content-addressed workflow storage", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-file-import-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const rootDir = path.join(temporary, "blobs");
  const sourcePath = path.join(temporary, "rank.mp4");
  const source = Buffer.concat([
    Buffer.from("ftypisom"),
    Buffer.alloc(2 * 1024 * 1024, 0x5a),
  ]);
  await fs.writeFile(sourcePath, source);

  const first = await persistWorkflowRuntimeAssetFile(
    sourcePath,
    {
      type: "video",
      name: "rank.mp4",
      mimeType: "video/mp4",
      source: "hot-rank",
    },
    { rootDir },
  );
  const second = await persistWorkflowRuntimeAssetFile(
    sourcePath,
    { type: "video", name: "rank.mp4", mimeType: "video/mp4" },
    { rootDir },
  );

  assert.equal(first.blobId, second.blobId);
  assert.equal(first.source, "hot-rank");
  assert.equal(first.size, source.length);
  assert.deepEqual(await fs.readFile(path.join(rootDir, first.blobId)), source);
  assert.deepEqual(await fs.readdir(rootDir), [first.blobId]);
  assert.equal((await fs.stat(path.join(rootDir, first.blobId))).mode & 0o777, 0o600);
});

test("persists workflow inputs once and restores them for a later resume", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-assets-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const data = Buffer.from("same-image").toString("base64");
  const runtimeAssets = {
    subject: [
      { type: "image", data, name: "subject.png", mimeType: "image/png" },
    ],
    garment: [
      { type: "image", data, name: "garment.png", mimeType: "image/png" },
    ],
  };

  const manifest = await persistWorkflowRuntimeAssets(runtimeAssets, {
    rootDir,
  });
  const restored = await loadWorkflowRuntimeAssets(manifest, { rootDir });
  const blobs = await fs.readdir(rootDir);

  assert.equal(blobs.length, 1);
  assert.equal(restored.subject[0].data, data);
  assert.equal(restored.garment[0].data, data);
  assert.equal(restored.subject[0].name, "subject.png");
});

test("accepts browser data URLs without corrupting PNG bytes", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-data-url-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const manifest = await persistWorkflowRuntimeAssets(
    {
      input: [{
        type: "image",
        data: `data:image/png;base64,${png.toString("base64")}`,
        name: "主图.png",
        mimeType: "image/png",
      }],
    },
    { rootDir },
  );
  const restored = await loadWorkflowRuntimeAssets(manifest, { rootDir });
  assert.deepEqual(Buffer.from(restored.input[0].data, "base64"), png);
});

test("materializes persisted PNG data only when a queued workflow begins", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-queued-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("queued-image"),
  ]);
  const manifest = await persistWorkflowRuntimeAssets(
    {
      subject: [{
        type: "image",
        data: png.toString("base64"),
        name: "主图.png",
        mimeType: "image/png",
      }],
    },
    { rootDir },
  );
  const input = { runtimeAssetManifest: manifest };
  assert.equal(input.runtimeAssetManifest.subject[0].data, undefined);
  const runtimeAssets = await materializeWorkflowRuntimeAssets(input, {
    rootDir,
  });
  assert.deepEqual(
    Buffer.from(runtimeAssets.subject[0].data, "base64"),
    png,
  );
});

test("newly selected files override one node without discarding other stored inputs", () => {
  const source = {
    subject: [{ name: "old-subject.png" }],
    garment: [{ name: "old-garment.png" }],
  };
  const submitted = {
    subject: [{ name: "new-subject.png" }],
    garment: [],
  };

  assert.deepEqual(mergeWorkflowRuntimeAssets(source, submitted), {
    subject: [{ name: "new-subject.png" }],
    garment: [{ name: "old-garment.png" }],
  });
});

test("publishes authenticated asset URLs without exposing storage identifiers", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-assets-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const manifest = await persistWorkflowRuntimeAssets(
    {
      "input/one": [
        {
          type: "image",
          data: Buffer.from("image-data").toString("base64"),
          name: "look.png",
          mimeType: "image/png",
        },
      ],
    },
    { rootDir },
  );
  const publicAssets = publicWorkflowRuntimeAssets("run-1", manifest);
  const buffer = await workflowRuntimeAssetBuffer(manifest, "input/one", 0, {
    rootDir,
  });

  assert.equal(
    publicAssets["input/one"][0].url,
    "/api/workflow-runs/run-1/assets/input%2Fone/0",
  );
  assert.equal("blobId" in publicAssets["input/one"][0], false);
  assert.equal(buffer.toString(), "image-data");
});

