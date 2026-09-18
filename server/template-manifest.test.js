import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateManifest,
  normalizeTemplateManifest,
  templateVersionRef,
} from "../shared/template-manifest.js";

const template = {
  id: "fashion-video",
  revision: 3,
  runMode: "backend",
  nodes: [
    {
      id: "garment",
      data: {
        kind: "input",
        title: "上传服装",
        remakeRequired: true,
        maxFiles: 4,
      },
    },
    {
      id: "person",
      data: {
        kind: "face-input",
        title: "认证真人",
        remakeRequired: true,
      },
    },
    {
      id: "director",
      data: { kind: "text", title: "导演提示词", remakeEditable: false },
    },
    {
      id: "video",
      data: {
        kind: "video",
        title: "视频文案",
        model: "kling-v3",
        aspectRatio: "9:16",
        duration: 15,
        digitalAssetIds: ["asset-1"],
      },
    },
  ],
  edges: [
    { source: "garment", target: "video" },
    { source: "person", target: "video" },
    { source: "director", target: "video" },
  ],
};

test("builds stable public fields and output contract", () => {
  const manifest = buildTemplateManifest(template);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.versionRef, "fashion-video@3");
  assert.deepEqual(
    manifest.fields.map((field) => field.fieldId),
    ["node:garment", "node:person", "node:video"],
  );
  assert.equal(manifest.fields[0].required, true);
  assert.equal(manifest.fields[1].type, "verified_person");
  assert.equal(manifest.output.type, "video");
  assert.equal(manifest.output.aspectRatio, "9:16");
  assert.equal(manifest.output.duration, 15);
  assert.equal(manifest.validation.status, "ready");
});

test("marks templates without executable output as drafts", () => {
  const manifest = buildTemplateManifest({
    id: "unfinished",
    nodes: [{ id: "input", data: { kind: "input", title: "素材" } }],
    edges: [],
  });
  assert.equal(manifest.validation.status, "draft");
  assert.match(manifest.validation.issues[0], /输出节点/);
});

test("describes Kling and Seedance identity requirements", () => {
  const requirements = buildTemplateManifest(template).assetRequirements;
  assert.ok(
    requirements.some((requirement) => requirement.type === "seedance_verified_person"),
  );
  assert.ok(
    requirements.some((requirement) => requirement.type === "kling_element"),
  );
});

test("migrates legacy templates and rebuilds manifests after a revision change", () => {
  const legacy = normalizeTemplateManifest(template);
  assert.equal(legacy.versionRef, "fashion-video@3");
  const changed = normalizeTemplateManifest({
    ...template,
    revision: 4,
    manifest: legacy,
  });
  assert.equal(changed.templateRevision, 4);
  assert.equal(changed.versionRef, "fashion-video@4");
  assert.equal(templateVersionRef({ id: "fashion-video", revision: 9 }), "fashion-video@9");
});

